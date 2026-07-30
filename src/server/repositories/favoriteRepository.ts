import type { JsonStore } from "../store/jsonStore.ts";
import type { FavoriteRecord } from "../types.ts";

export interface FavoriteQuery {
  userId: string;
  itemType?: string | undefined;
  tag?: string | undefined;
  /** Case-insensitive substring match against title, note and itemId. */
  search?: string | undefined;
  limit: number;
  offset: number;
}

export class FavoriteRepository {
  #store: JsonStore;

  constructor(store: JsonStore) {
    this.#store = store;
  }

  findById(id: string): FavoriteRecord | null {
    return this.#store.data.favorites.find((f) => f.id === id) ?? null;
  }

  findByItem(userId: string, itemType: string, itemId: string): FavoriteRecord | null {
    return (
      this.#store.data.favorites.find(
        (f) => f.userId === userId && f.itemType === itemType && f.itemId === itemId,
      ) ?? null
    );
  }

  /** Returns the page plus the total number of matches before pagination. */
  list(query: FavoriteQuery): { rows: FavoriteRecord[]; total: number } {
    const search = query.search?.toLowerCase();

    const matches = this.#store.data.favorites
      .filter((f) => f.userId === query.userId)
      .filter((f) => !query.itemType || f.itemType === query.itemType)
      .filter((f) => !query.tag || f.tags.includes(query.tag))
      .filter((f) => {
        if (!search) return true;
        return [f.title, f.note, f.itemId].some((v) => v?.toLowerCase().includes(search));
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return {
      rows: matches.slice(query.offset, query.offset + query.limit),
      total: matches.length,
    };
  }

  /** Distinct itemTypes a user has favourited, with counts — handy for filter UIs. */
  typeCounts(userId: string): { itemType: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const f of this.#store.data.favorites) {
      if (f.userId !== userId) continue;
      counts.set(f.itemType, (counts.get(f.itemType) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([itemType, count]) => ({ itemType, count }))
      .sort((a, b) => b.count - a.count || a.itemType.localeCompare(b.itemType));
  }

  async create(record: FavoriteRecord): Promise<FavoriteRecord> {
    this.#store.data.favorites.push(record);
    await this.#store.commit();
    return record;
  }

  async update(id: string, patch: Partial<FavoriteRecord>): Promise<FavoriteRecord | null> {
    const existing = this.findById(id);
    if (!existing) return null;

    Object.assign(existing, patch, {
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    });
    await this.#store.commit();
    return existing;
  }

  async remove(id: string): Promise<boolean> {
    const list = this.#store.data.favorites;
    const index = list.findIndex((f) => f.id === id);
    if (index === -1) return false;

    list.splice(index, 1);
    await this.#store.commit();
    return true;
  }
}

import { newId } from "../crypto.ts";
import { conflict, notFound } from "../errors.ts";
import type { FavoriteRepository } from "../repositories/favoriteRepository.ts";
import type { UserRepository } from "../repositories/userRepository.ts";
import type { FavoriteCreateInput, FavoritePatch, FavoriteQueryInput } from "../schemas.ts";
import { toFavorite } from "../serializers.ts";
import type { Favorite, FavoriteRecord, ListEnvelope } from "../types.ts";

export class FavoriteService {
  #favorites: FavoriteRepository;
  #users: UserRepository;

  constructor(favorites: FavoriteRepository, users: UserRepository) {
    this.#favorites = favorites;
    this.#users = users;
  }

  list(userId: string, query: FavoriteQueryInput): ListEnvelope<Favorite> {
    const { rows, total } = this.#favorites.list({
      userId,
      itemType: query.itemType,
      tag: query.tag,
      search: query.search,
      limit: query.limit,
      offset: query.offset,
    });

    return { data: rows.map(toFavorite), total, limit: query.limit, offset: query.offset };
  }

  /** Same as `list`, but resolved by username for public profile pages. */
  listByUsername(username: string, query: FavoriteQueryInput): ListEnvelope<Favorite> {
    const user = this.#users.findByUsername(username);
    if (!user) throw notFound(`No user named "${username}".`);
    return this.list(user.id, query);
  }

  typeCounts(userId: string): { itemType: string; count: number }[] {
    return this.#favorites.typeCounts(userId);
  }

  get(userId: string, id: string): Favorite {
    return toFavorite(this.#owned(userId, id));
  }

  async add(userId: string, input: FavoriteCreateInput): Promise<Favorite> {
    const duplicate = this.#favorites.findByItem(userId, input.itemType, input.itemId);
    if (duplicate) {
      throw conflict("That item is already in your favorites.", { favoriteId: duplicate.id });
    }

    const now = new Date().toISOString();
    const record: FavoriteRecord = {
      id: newId(),
      userId,
      itemType: input.itemType,
      itemId: input.itemId,
      title: input.title ?? null,
      url: input.url ?? null,
      note: input.note ?? null,
      tags: dedupeTags(input.tags ?? []),
      createdAt: now,
      updatedAt: now,
    };

    await this.#favorites.create(record);
    return toFavorite(record);
  }

  async update(userId: string, id: string, patch: FavoritePatch): Promise<Favorite> {
    this.#owned(userId, id);

    const normalised = patch.tags ? { ...patch, tags: dedupeTags(patch.tags) } : patch;
    const updated = await this.#favorites.update(id, normalised);
    if (!updated) throw notFound("Favorite not found.");
    return toFavorite(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    this.#owned(userId, id);
    await this.#favorites.remove(id);
  }

  /**
   * Fetches a favorite and asserts ownership. Someone else's favorite reports
   * 404 rather than 403 so ids belonging to other users stay unguessable.
   */
  #owned(userId: string, id: string): FavoriteRecord {
    const favorite = this.#favorites.findById(id);
    if (!favorite || favorite.userId !== userId) throw notFound("Favorite not found.");
    return favorite;
  }
}

const dedupeTags = (tags: string[]): string[] => [...new Set(tags)];

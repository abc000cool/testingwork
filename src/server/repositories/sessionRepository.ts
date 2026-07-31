import type { JsonStore } from "../store/jsonStore.ts";
import type { SessionRecord } from "../types.ts";

export class SessionRepository {
  #store: JsonStore;

  constructor(store: JsonStore) {
    this.#store = store;
  }

  /** Returns the session only if it exists and has not expired. */
  findValid(token: string, now: Date = new Date()): SessionRecord | null {
    const session = this.#store.data.sessions.find((s) => s.token === token);
    if (!session) return null;
    return new Date(session.expiresAt) > now ? session : null;
  }

  async create(record: SessionRecord): Promise<SessionRecord> {
    this.#store.data.sessions.push(record);
    await this.#store.commit();
    return record;
  }

  async remove(token: string): Promise<boolean> {
    const list = this.#store.data.sessions;
    const index = list.findIndex((s) => s.token === token);
    if (index === -1) return false;

    list.splice(index, 1);
    await this.#store.commit();
    return true;
  }

  /** Drops every session for a user. Used when credentials change. */
  async removeAllForUser(userId: string): Promise<number> {
    const before = this.#store.data.sessions.length;
    this.#store.data.sessions = this.#store.data.sessions.filter((s) => s.userId !== userId);
    const removed = before - this.#store.data.sessions.length;
    if (removed > 0) await this.#store.commit();
    return removed;
  }

  async purgeExpired(now: Date = new Date()): Promise<number> {
    const before = this.#store.data.sessions.length;
    this.#store.data.sessions = this.#store.data.sessions.filter(
      (s) => new Date(s.expiresAt) > now,
    );
    const removed = before - this.#store.data.sessions.length;
    if (removed > 0) await this.#store.commit();
    return removed;
  }
}

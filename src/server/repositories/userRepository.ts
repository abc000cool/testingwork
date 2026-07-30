import type { JsonStore } from "../store/jsonStore.ts";
import type { ProfileRecord, UserRecord } from "../types.ts";

export class UserRepository {
  #store: JsonStore;

  constructor(store: JsonStore) {
    this.#store = store;
  }

  findById(id: string): UserRecord | null {
    return this.#store.data.users.find((u) => u.id === id) ?? null;
  }

  findByUsername(username: string): UserRecord | null {
    const key = username.toLowerCase();
    return this.#store.data.users.find((u) => u.usernameKey === key) ?? null;
  }

  findByEmail(email: string): UserRecord | null {
    const key = email.toLowerCase();
    return this.#store.data.users.find((u) => u.emailKey === key) ?? null;
  }

  /** Creates the user and its profile together — a user is never profile-less. */
  async create(user: UserRecord, profile: ProfileRecord): Promise<UserRecord> {
    this.#store.data.users.push(user);
    this.#store.data.profiles.push(profile);
    await this.#store.commit();
    return user;
  }
}

export class ProfileRepository {
  #store: JsonStore;

  constructor(store: JsonStore) {
    this.#store = store;
  }

  findByUserId(userId: string): ProfileRecord | null {
    return this.#store.data.profiles.find((p) => p.userId === userId) ?? null;
  }

  async update(userId: string, patch: Partial<ProfileRecord>): Promise<ProfileRecord | null> {
    const existing = this.findByUserId(userId);
    if (!existing) return null;

    Object.assign(existing, patch, { userId, updatedAt: new Date().toISOString() });
    await this.#store.commit();
    return existing;
  }
}

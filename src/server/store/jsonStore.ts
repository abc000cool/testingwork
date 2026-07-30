import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  FavoriteRecord,
  ProfileRecord,
  SessionRecord,
  UserRecord,
} from "../types.ts";

export interface DbShape {
  users: UserRecord[];
  profiles: ProfileRecord[];
  favorites: FavoriteRecord[];
  sessions: SessionRecord[];
}

const emptyDb = (): DbShape => ({ users: [], profiles: [], favorites: [], sessions: [] });

/**
 * A tiny durable document store: the whole database lives in memory and is
 * snapshotted to a single JSON file after each mutation.
 *
 * This is deliberately the only place that knows about persistence. Repositories
 * depend on the `DbShape` arrays, so swapping this for Postgres later means
 * rewriting the repositories against a real client and nothing above them.
 */
export class JsonStore {
  readonly data: DbShape;
  #path: string | null;
  /** Serialises snapshot writes so two commits can never interleave. */
  #tail: Promise<void> = Promise.resolve();

  constructor(data: DbShape, path: string | null) {
    this.data = data;
    this.#path = path;
  }

  static async open(path: string | null): Promise<JsonStore> {
    if (!path) return new JsonStore(emptyDb(), null);

    await mkdir(dirname(path), { recursive: true });
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as Partial<DbShape>;
      return new JsonStore({ ...emptyDb(), ...parsed }, path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      return new JsonStore(emptyDb(), path);
    }
  }

  /** Snapshot the current state to disk. No-op for in-memory stores. */
  async commit(): Promise<void> {
    const path = this.#path;
    if (!path) return;

    const write = this.#tail.then(async () => {
      // Write-then-rename so a crash mid-write cannot truncate the live file.
      const tmp = `${path}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(this.data, null, 2), "utf8");
      await rename(tmp, path);
    });
    this.#tail = write.catch(() => undefined);
    return write;
  }
}

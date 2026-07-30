import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { after, describe, it } from "node:test";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createContainer } from "./container.ts";
import type { Favorite, ListEnvelope, Me } from "./types.ts";

interface Response<T> {
  status: number;
  body: T;
}

interface Client {
  request<T = any>(
    method: string,
    path: string,
    options?: { body?: unknown; token?: string },
  ): Promise<Response<T>>;
  close(): Promise<void>;
}

/** Boots the app over an in-memory store on an ephemeral port. */
async function startClient(): Promise<Client> {
  const config = { ...loadConfig({ DATA_FILE: "" }), port: 0 };
  const app = createApp(await createContainer(config), { logErrors: false });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    async request(method, path, options = {}) {
      const headers: Record<string, string> = {};
      if (options.body !== undefined) headers["content-type"] = "application/json";
      if (options.token) headers.authorization = `Bearer ${options.token}`;

      const res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });

      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null };
    },
    async close() {
      server.close();
      await once(server, "close");
    },
  };
}

const CREDENTIALS = { username: "ada", email: "ada@example.com", password: "correct-horse" };

/** Signs up a fresh user and returns their token. */
async function signUp(client: Client, overrides: Record<string, unknown> = {}) {
  const res = await client.request<{ user: Me; token: string }>("POST", "/api/auth/signup", {
    body: { ...CREDENTIALS, ...overrides },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

describe("health", () => {
  it("reports ok", async () => {
    const client = await startClient();
    after(() => client.close());

    const res = await client.request("GET", "/api/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
  });

  it("returns a structured 404 for unknown routes", async () => {
    const client = await startClient();
    after(() => client.close());

    const res = await client.request("GET", "/api/nope");
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, "NOT_FOUND");
  });
});

describe("auth", () => {
  it("creates a user with a default profile and never returns the hash", async () => {
    const client = await startClient();
    after(() => client.close());

    const { user, token } = await signUp(client);
    assert.equal(user.username, "ada");
    assert.equal(user.email, "ada@example.com");
    assert.equal(user.profile.displayName, "ada");
    assert.equal(user.profile.bio, "");
    assert.deepEqual(user.profile.links, []);
    assert.ok(token.length > 20);
    assert.equal(JSON.stringify(user).includes("scrypt"), false);
  });

  it("rejects a duplicate username case-insensitively", async () => {
    const client = await startClient();
    after(() => client.close());

    await signUp(client);
    const res = await client.request("POST", "/api/auth/signup", {
      body: { ...CREDENTIALS, username: "ADA", email: "other@example.com" },
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.details.field, "username");
  });

  it("rejects a weak password with field-level detail", async () => {
    const client = await startClient();
    after(() => client.close());

    const res = await client.request("POST", "/api/auth/signup", {
      body: { ...CREDENTIALS, password: "short" },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
    assert.equal(res.body.error.details[0].path, "password");
  });

  it("logs in by username or email and rejects a bad password identically", async () => {
    const client = await startClient();
    after(() => client.close());
    await signUp(client);

    for (const usernameOrEmail of ["ada", "ada@example.com"]) {
      const ok = await client.request("POST", "/api/auth/login", {
        body: { usernameOrEmail, password: CREDENTIALS.password },
      });
      assert.equal(ok.status, 200, usernameOrEmail);
      assert.ok(ok.body.token);
    }

    const wrongPassword = await client.request("POST", "/api/auth/login", {
      body: { usernameOrEmail: "ada", password: "nope-nope-nope" },
    });
    const noSuchUser = await client.request("POST", "/api/auth/login", {
      body: { usernameOrEmail: "ghost", password: "nope-nope-nope" },
    });
    assert.equal(wrongPassword.status, 401);
    assert.deepEqual(noSuchUser.body, wrongPassword.body);
  });

  it("invalidates the token on logout", async () => {
    const client = await startClient();
    after(() => client.close());
    const { token } = await signUp(client);

    assert.equal((await client.request("POST", "/api/auth/logout", { token })).status, 204);
    assert.equal((await client.request("GET", "/api/me", { token })).status, 401);
  });

  it("rejects missing and malformed tokens", async () => {
    const client = await startClient();
    after(() => client.close());

    assert.equal((await client.request("GET", "/api/me")).status, 401);
    assert.equal((await client.request("GET", "/api/me", { token: "garbage" })).status, 401);
  });
});

describe("profile", () => {
  it("patches only the supplied fields", async () => {
    const client = await startClient();
    after(() => client.close());
    const { token } = await signUp(client);

    const patched = await client.request("PATCH", "/api/me/profile", {
      token,
      body: {
        displayName: "Ada Lovelace",
        bio: "Analytical engines.",
        links: [{ label: "Site", url: "https://example.com" }],
      },
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.displayName, "Ada Lovelace");
    assert.equal(patched.body.links[0].label, "Site");

    const again = await client.request("PATCH", "/api/me/profile", {
      token,
      body: { location: "London" },
    });
    assert.equal(again.body.location, "London");
    assert.equal(again.body.displayName, "Ada Lovelace", "untouched fields survive");
  });

  it("rejects an empty patch and an invalid link url", async () => {
    const client = await startClient();
    after(() => client.close());
    const { token } = await signUp(client);

    assert.equal(
      (await client.request("PATCH", "/api/me/profile", { token, body: {} })).status,
      400,
    );
    const badLink = await client.request("PATCH", "/api/me/profile", {
      token,
      body: { links: [{ label: "Bad", url: "not-a-url" }] },
    });
    assert.equal(badLink.status, 400);
  });

  it("serves a public profile without a token and hides the email", async () => {
    const client = await startClient();
    after(() => client.close());
    const { token } = await signUp(client);
    await client.request("PATCH", "/api/me/profile", { token, body: { bio: "Hello." } });

    const res = await client.request("GET", "/api/users/ADA/profile");
    assert.equal(res.status, 200);
    assert.equal(res.body.user.username, "ada");
    assert.equal(res.body.profile.bio, "Hello.");
    assert.equal("email" in res.body.user, false);

    assert.equal((await client.request("GET", "/api/users/ghost/profile")).status, 404);
  });
});

describe("favorites", () => {
  it("creates, reads, updates and deletes", async () => {
    const client = await startClient();
    after(() => client.close());
    const { token, user } = await signUp(client);

    const created = await client.request<Favorite>("POST", "/api/me/favorites", {
      token,
      body: {
        itemType: "movie",
        itemId: "tt0071853",
        title: "Holy Grail",
        tags: ["comedy", "comedy"],
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.userId, user.id);
    assert.deepEqual(created.body.tags, ["comedy"], "tags are de-duplicated");
    assert.equal(created.body.note, null);

    const id = created.body.id;
    assert.equal((await client.request("GET", `/api/me/favorites/${id}`, { token })).status, 200);

    const patched = await client.request<Favorite>("PATCH", `/api/me/favorites/${id}`, {
      token,
      body: { note: "Rewatch." },
    });
    assert.equal(patched.body.note, "Rewatch.");
    assert.equal(patched.body.title, "Holy Grail", "untouched fields survive");

    assert.equal(
      (await client.request("DELETE", `/api/me/favorites/${id}`, { token })).status,
      204,
    );
    assert.equal((await client.request("GET", `/api/me/favorites/${id}`, { token })).status, 404);
  });

  it("rejects the same item twice for one user but allows it across users", async () => {
    const client = await startClient();
    after(() => client.close());
    const ada = await signUp(client);
    const grace = await signUp(client, { username: "grace", email: "grace@example.com" });

    const body = { itemType: "movie", itemId: "tt0071853" };
    assert.equal(
      (await client.request("POST", "/api/me/favorites", { token: ada.token, body })).status,
      201,
    );

    const dupe = await client.request("POST", "/api/me/favorites", { token: ada.token, body });
    assert.equal(dupe.status, 409);
    assert.ok(dupe.body.error.details.favoriteId);

    assert.equal(
      (await client.request("POST", "/api/me/favorites", { token: grace.token, body })).status,
      201,
      "a different user may favorite the same item",
    );
  });

  it("filters, paginates and counts by type", async () => {
    const client = await startClient();
    after(() => client.close());
    const { token } = await signUp(client);

    const seed = [
      { itemType: "movie", itemId: "m1", title: "Alpha", tags: ["classic"] },
      { itemType: "movie", itemId: "m2", title: "Beta" },
      { itemType: "book", itemId: "b1", title: "Gamma", tags: ["classic"] },
    ];
    for (const body of seed) {
      assert.equal(
        (await client.request("POST", "/api/me/favorites", { token, body })).status,
        201,
      );
    }

    const movies = await client.request<ListEnvelope<Favorite>>(
      "GET",
      "/api/me/favorites?itemType=movie",
      { token },
    );
    assert.equal(movies.body.total, 2);
    assert.equal(movies.body.data.every((f) => f.itemType === "movie"), true);

    const classics = await client.request<ListEnvelope<Favorite>>(
      "GET",
      "/api/me/favorites?tag=classic",
      { token },
    );
    assert.equal(classics.body.total, 2);

    const search = await client.request<ListEnvelope<Favorite>>(
      "GET",
      "/api/me/favorites?search=gam",
      { token },
    );
    assert.equal(search.body.total, 1);
    assert.equal(search.body.data[0]?.title, "Gamma");

    const page = await client.request<ListEnvelope<Favorite>>(
      "GET",
      "/api/me/favorites?limit=2&offset=2",
      { token },
    );
    assert.equal(page.body.total, 3);
    assert.equal(page.body.data.length, 1);
    assert.equal(page.body.limit, 2);
    assert.equal(page.body.offset, 2);

    const types = await client.request("GET", "/api/me/favorites/types", { token });
    assert.deepEqual(types.body.data, [
      { itemType: "movie", count: 2 },
      { itemType: "book", count: 1 },
    ]);
  });

  it("hides one user's favorites from another", async () => {
    const client = await startClient();
    after(() => client.close());
    const ada = await signUp(client);
    const grace = await signUp(client, { username: "grace", email: "grace@example.com" });

    const created = await client.request<Favorite>("POST", "/api/me/favorites", {
      token: ada.token,
      body: { itemType: "movie", itemId: "m1" },
    });
    const id = created.body.id;

    assert.equal(
      (await client.request("GET", `/api/me/favorites/${id}`, { token: grace.token })).status,
      404,
      "another user's favorite is not readable",
    );
    assert.equal(
      (await client.request("DELETE", `/api/me/favorites/${id}`, { token: grace.token })).status,
      404,
    );
    assert.equal(
      (await client.request("GET", "/api/me/favorites", { token: grace.token })).body.total,
      0,
    );
    assert.equal(
      (await client.request("GET", `/api/me/favorites/${id}`, { token: ada.token })).status,
      200,
      "the owner still has it",
    );
  });

  it("exposes a user's favorites publicly by username", async () => {
    const client = await startClient();
    after(() => client.close());
    const { token } = await signUp(client);
    await client.request("POST", "/api/me/favorites", {
      token,
      body: { itemType: "movie", itemId: "m1", title: "Alpha" },
    });

    const res = await client.request<ListEnvelope<Favorite>>("GET", "/api/users/ada/favorites");
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 1);
    assert.equal((await client.request("GET", "/api/users/ghost/favorites")).status, 404);
  });

  it("validates the payload and the query", async () => {
    const client = await startClient();
    after(() => client.close());
    const { token } = await signUp(client);

    const missingItemId = await client.request("POST", "/api/me/favorites", {
      token,
      body: { itemType: "movie" },
    });
    assert.equal(missingItemId.status, 400);
    assert.equal(missingItemId.body.error.code, "VALIDATION_ERROR");

    const badLimit = await client.request("GET", "/api/me/favorites?limit=999", { token });
    assert.equal(badLimit.status, 400);
  });
});

describe("persistence", () => {
  it("round-trips through the JSON snapshot file", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const dir = await mkdtemp(join(tmpdir(), "user-system-"));
    const dataFile = join(dir, "db.json");
    after(() => rm(dir, { recursive: true, force: true }));

    const config = { ...loadConfig({ DATA_FILE: "" }), dataFile, port: 0 };

    const first = createApp(await createContainer(config), { logErrors: false });
    const s1 = first.listen(0, "127.0.0.1");
    await once(s1, "listening");
    const base1 = `http://127.0.0.1:${(s1.address() as AddressInfo).port}`;

    const signup = await fetch(`${base1}/api/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(CREDENTIALS),
    });
    const { token } = (await signup.json()) as { token: string };
    await fetch(`${base1}/api/me/favorites`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ itemType: "movie", itemId: "m1", title: "Alpha" }),
    });
    s1.close();
    await once(s1, "close");

    // A brand-new process-equivalent reading the same file must see the data,
    // including the still-valid session token.
    const second = createApp(await createContainer(config), { logErrors: false });
    const s2 = second.listen(0, "127.0.0.1");
    await once(s2, "listening");
    const base2 = `http://127.0.0.1:${(s2.address() as AddressInfo).port}`;
    after(async () => {
      s2.close();
      await once(s2, "close");
    });

    const me = await fetch(`${base2}/api/me`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(me.status, 200);
    assert.equal(((await me.json()) as Me).username, "ada");

    const favorites = await fetch(`${base2}/api/users/ada/favorites`);
    assert.equal(((await favorites.json()) as ListEnvelope<Favorite>).total, 1);
  });
});

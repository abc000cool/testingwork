import type { Config } from "../config.ts";
import { hashPassword, newId, newToken, verifyPassword } from "../crypto.ts";
import { conflict, unauthorized } from "../errors.ts";
import type { ProfileRepository, UserRepository } from "../repositories/userRepository.ts";
import type { SessionRepository } from "../repositories/sessionRepository.ts";
import type { LoginInput, SignupInput } from "../schemas.ts";
import { toMe } from "../serializers.ts";
import type { AuthContext, Me, ProfileRecord, UserRecord } from "../types.ts";

export interface AuthResult {
  user: Me;
  token: string;
  expiresAt: string;
}

/**
 * A real scrypt hash to verify against when the account does not exist, so a
 * login attempt costs the same whether or not the username is real. Without it
 * response timing tells an attacker which accounts exist.
 */
const DUMMY_HASH_PROMISE = hashPassword("password-that-is-never-valid");

export class AuthService {
  #users: UserRepository;
  #profiles: ProfileRepository;
  #sessions: SessionRepository;
  #config: Config;

  constructor(
    users: UserRepository,
    profiles: ProfileRepository,
    sessions: SessionRepository,
    config: Config,
  ) {
    this.#users = users;
    this.#profiles = profiles;
    this.#sessions = sessions;
    this.#config = config;
  }

  async signup(input: SignupInput): Promise<AuthResult> {
    if (this.#users.findByUsername(input.username)) {
      throw conflict("That username is already taken.", { field: "username" });
    }
    if (this.#users.findByEmail(input.email)) {
      throw conflict("That email is already registered.", { field: "email" });
    }

    const now = new Date().toISOString();
    const user: UserRecord = {
      id: newId(),
      username: input.username,
      usernameKey: input.username.toLowerCase(),
      email: input.email,
      emailKey: input.email.toLowerCase(),
      passwordHash: await hashPassword(input.password),
      createdAt: now,
      updatedAt: now,
    };
    const profile: ProfileRecord = {
      userId: user.id,
      displayName: input.displayName ?? input.username,
      bio: "",
      avatarUrl: null,
      location: null,
      links: [],
      updatedAt: now,
    };

    await this.#users.create(user, profile);
    return this.#issueSession(user, profile);
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const identifier = input.usernameOrEmail;
    const user = identifier.includes("@")
      ? this.#users.findByEmail(identifier)
      : this.#users.findByUsername(identifier);

    // Same message and same cost for both failure modes — no user enumeration.
    const ok = await verifyPassword(input.password, user?.passwordHash ?? (await DUMMY_HASH_PROMISE));
    if (!user || !ok) throw unauthorized("Incorrect username or password.");

    const profile = this.#profiles.findByUserId(user.id);
    if (!profile) throw unauthorized("Incorrect username or password.");

    return this.#issueSession(user, profile);
  }

  async logout(token: string): Promise<void> {
    await this.#sessions.remove(token);
  }

  /** Resolves a bearer token to the owning user, or throws 401. */
  async authenticate(token: string): Promise<AuthContext> {
    const session = this.#sessions.findValid(token);
    if (!session) throw unauthorized("Your session has expired. Please sign in again.");

    const user = this.#users.findById(session.userId);
    if (!user) {
      // Orphaned session (user removed out of band) — clean it up.
      await this.#sessions.remove(token);
      throw unauthorized("Your session is no longer valid.");
    }

    return { user, token };
  }

  async #issueSession(user: UserRecord, profile: ProfileRecord): Promise<AuthResult> {
    const token = newToken();
    const expiresAt = new Date(Date.now() + this.#config.sessionTtlMs).toISOString();

    await this.#sessions.create({
      token,
      userId: user.id,
      createdAt: new Date().toISOString(),
      expiresAt,
    });

    return { user: toMe(user, profile), token, expiresAt };
  }
}

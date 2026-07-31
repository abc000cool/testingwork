/**
 * Domain records (how things are stored) and wire types (how things are sent).
 *
 * The wire types `PublicUser`, `UserProfile`, `Me` and `Favorite` are the agreed
 * cross-session contracts; see src/server/README.md. Changing their shape is a
 * breaking change for the frontend.
 */

// ---------------------------------------------------------------- stored records

export interface UserRecord {
  id: string;
  username: string;
  /** Lowercased `username`, used for case-insensitive lookup and uniqueness. */
  usernameKey: string;
  email: string;
  emailKey: string;
  /** `scrypt$<salt-hex>$<derived-key-hex>`. Never leaves the server. */
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileLink {
  label: string;
  url: string;
}

export interface ProfileRecord {
  userId: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  location: string | null;
  links: ProfileLink[];
  updatedAt: string;
}

export interface FavoriteRecord {
  id: string;
  userId: string;
  /** Caller-defined namespace, e.g. `"movie"`, `"article"`. */
  itemType: string;
  /** Unique within `(userId, itemType)`. */
  itemId: string;
  title: string | null;
  url: string | null;
  note: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

// ---------------------------------------------------------------- wire types

export interface PublicUser {
  id: string;
  username: string;
  createdAt: string;
}

export interface UserProfile {
  userId: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  location: string | null;
  links: ProfileLink[];
  updatedAt: string;
}

export type Me = PublicUser & {
  email: string;
  profile: UserProfile;
};

export interface Favorite {
  id: string;
  userId: string;
  itemType: string;
  itemId: string;
  title: string | null;
  url: string | null;
  note: string | null;
  tags: string[];
  createdAt: string;
}

export interface ListEnvelope<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuthContext {
  user: UserRecord;
  token: string;
}

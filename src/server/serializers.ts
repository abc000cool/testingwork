import type {
  Favorite,
  FavoriteRecord,
  Me,
  ProfileRecord,
  PublicUser,
  UserProfile,
  UserRecord,
} from "./types.ts";

/**
 * The only place records become wire payloads. Every response goes through here
 * so a field like `passwordHash` cannot leak by being spread into a response.
 */

export const toPublicUser = (user: UserRecord): PublicUser => ({
  id: user.id,
  username: user.username,
  createdAt: user.createdAt,
});

export const toUserProfile = (profile: ProfileRecord): UserProfile => ({
  userId: profile.userId,
  displayName: profile.displayName,
  bio: profile.bio,
  avatarUrl: profile.avatarUrl,
  location: profile.location,
  links: profile.links.map((l) => ({ label: l.label, url: l.url })),
  updatedAt: profile.updatedAt,
});

export const toMe = (user: UserRecord, profile: ProfileRecord): Me => ({
  ...toPublicUser(user),
  email: user.email,
  profile: toUserProfile(profile),
});

export const toFavorite = (favorite: FavoriteRecord): Favorite => ({
  id: favorite.id,
  userId: favorite.userId,
  itemType: favorite.itemType,
  itemId: favorite.itemId,
  title: favorite.title,
  url: favorite.url,
  note: favorite.note,
  tags: [...favorite.tags],
  createdAt: favorite.createdAt,
});

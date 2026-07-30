import { z } from "zod";

/** Trims, then treats an empty string as "not provided". */
const trimmed = z.string().trim();

const usernameSchema = trimmed
  .min(3, "Username must be at least 3 characters.")
  .max(30, "Username must be at most 30 characters.")
  .regex(/^[a-zA-Z0-9_-]+$/, "Username may only contain letters, numbers, hyphens and underscores.");

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(200, "Password must be at most 200 characters.");

const linkSchema = z.object({
  label: trimmed.min(1).max(40),
  url: z.url("Each link must be a valid URL."),
});

// ---------------------------------------------------------------- auth

export const signupSchema = z.object({
  username: usernameSchema,
  email: z.email("A valid email address is required.").transform((v) => v.trim()),
  password: passwordSchema,
  displayName: trimmed.min(1).max(80).optional(),
});

export const loginSchema = z.object({
  /** Accepts either identifier so the frontend needs a single field. */
  usernameOrEmail: trimmed.min(1, "Username or email is required."),
  password: z.string().min(1, "Password is required."),
});

// ---------------------------------------------------------------- profile

export const profilePatchSchema = z
  .object({
    displayName: trimmed.min(1).max(80),
    bio: z.string().trim().max(500),
    avatarUrl: z.url().nullable(),
    location: trimmed.max(100).nullable(),
    links: z.array(linkSchema).max(10, "At most 10 links."),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Provide at least one field to update.",
  });

// ---------------------------------------------------------------- favorites

export const favoriteCreateSchema = z.object({
  itemType: trimmed
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_-]+$/i, "itemType may only contain letters, numbers, hyphens and underscores."),
  itemId: trimmed.min(1).max(200),
  title: trimmed.max(200).nullable().optional(),
  url: z.url().nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  tags: z.array(trimmed.min(1).max(40)).max(20).optional(),
});

export const favoritePatchSchema = z
  .object({
    title: trimmed.max(200).nullable(),
    url: z.url().nullable(),
    note: z.string().trim().max(1000).nullable(),
    tags: z.array(trimmed.min(1).max(40)).max(20),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Provide at least one field to update.",
  });

export const favoriteQuerySchema = z.object({
  itemType: trimmed.min(1).max(40).optional(),
  tag: trimmed.min(1).max(40).optional(),
  search: trimmed.min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProfilePatch = z.infer<typeof profilePatchSchema>;
export type FavoriteCreateInput = z.infer<typeof favoriteCreateSchema>;
export type FavoritePatch = z.infer<typeof favoritePatchSchema>;
export type FavoriteQueryInput = z.infer<typeof favoriteQuerySchema>;

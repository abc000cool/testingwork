import { notFound } from "../errors.ts";
import type { ProfileRepository, UserRepository } from "../repositories/userRepository.ts";
import type { ProfilePatch } from "../schemas.ts";
import { toMe, toPublicUser, toUserProfile } from "../serializers.ts";
import type { Me, PublicUser, UserProfile, UserRecord } from "../types.ts";

export interface PublicProfileView {
  user: PublicUser;
  profile: UserProfile;
}

export class ProfileService {
  #users: UserRepository;
  #profiles: ProfileRepository;

  constructor(users: UserRepository, profiles: ProfileRepository) {
    this.#users = users;
    this.#profiles = profiles;
  }

  getMe(user: UserRecord): Me {
    const profile = this.#profiles.findByUserId(user.id);
    if (!profile) throw notFound("Profile not found.");
    return toMe(user, profile);
  }

  getPublicProfile(username: string): PublicProfileView {
    const user = this.#users.findByUsername(username);
    if (!user) throw notFound(`No user named "${username}".`);

    const profile = this.#profiles.findByUserId(user.id);
    if (!profile) throw notFound(`No user named "${username}".`);

    return { user: toPublicUser(user), profile: toUserProfile(profile) };
  }

  async updateProfile(userId: string, patch: ProfilePatch): Promise<UserProfile> {
    const updated = await this.#profiles.update(userId, patch);
    if (!updated) throw notFound("Profile not found.");
    return toUserProfile(updated);
  }
}

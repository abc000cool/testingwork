import type { Config } from "./config.ts";
import { FavoriteRepository } from "./repositories/favoriteRepository.ts";
import { SessionRepository } from "./repositories/sessionRepository.ts";
import { ProfileRepository, UserRepository } from "./repositories/userRepository.ts";
import { AuthService } from "./services/authService.ts";
import { FavoriteService } from "./services/favoriteService.ts";
import { ProfileService } from "./services/profileService.ts";
import { JsonStore } from "./store/jsonStore.ts";

export interface Container {
  config: Config;
  store: JsonStore;
  authService: AuthService;
  profileService: ProfileService;
  favoriteService: FavoriteService;
  sessions: SessionRepository;
}

/**
 * Composition root. Everything is constructed here and passed down explicitly,
 * so tests can build a container over an in-memory store (`dataFile: null`).
 */
export async function createContainer(config: Config): Promise<Container> {
  const store = await JsonStore.open(config.dataFile);

  const users = new UserRepository(store);
  const profiles = new ProfileRepository(store);
  const sessions = new SessionRepository(store);
  const favorites = new FavoriteRepository(store);

  return {
    config,
    store,
    sessions,
    authService: new AuthService(users, profiles, sessions, config),
    profileService: new ProfileService(users, profiles),
    favoriteService: new FavoriteService(favorites, users),
  };
}

import type { MovieRecord } from "./types";

type UserProfile = {
  userId: string;
  ratingsCount: number;
  feelCentroid: number[] | null;
  dirAff: Record<string, number>;
  castAff: Record<string, number>;
  decadeAff: Record<string, number>;
};

declare global {
  // eslint-disable-next-line no-var
  var __FILMCLUB_CACHE__: {
    moviesById: Map<number, MovieRecord>;
    userById: Map<string, UserProfile>;
  } | undefined;
}

function getStore() {
  if (!globalThis.__FILMCLUB_CACHE__) {
    globalThis.__FILMCLUB_CACHE__ = {
      moviesById: new Map<number, MovieRecord>(),
      userById: new Map<string, UserProfile>()
    };
  }
  return globalThis.__FILMCLUB_CACHE__;
}

export function upsertMovie(m: MovieRecord) {
  getStore().moviesById.set(m.tmdbId, m);
}

export function getMovie(tmdbId: number) {
  return getStore().moviesById.get(tmdbId) || null;
}

export function getAllMovies() {
  return Array.from(getStore().moviesById.values());
}

export function getOrCreateUser(userId: string): UserProfile {
  const store = getStore();
  const u = store.userById.get(userId);
  if (u) return u;

  const fresh: UserProfile = {
    userId,
    ratingsCount: 0,
    feelCentroid: null,
    dirAff: {},
    castAff: {},
    decadeAff: {}
  };
  store.userById.set(userId, fresh);
  return fresh;
}

export function saveUser(u: UserProfile) {
  getStore().userById.set(u.userId, u);
}

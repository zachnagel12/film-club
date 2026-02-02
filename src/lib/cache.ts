// src/lib/cache.ts
import type { MovieRecord, UserActions } from "./types";

/**
 * In-memory cache.
 * NOTE: this is NOT persistent across serverless restarts/deploys.
 * It's fine for now, but auth+prisma will be the real persistence layer.
 */

export type UserRecord = {
  // canonical id
  id: string;

  // backwards-compatible alias
  userId: string;

  createdAt: number;

  // actions for save/dislike
  actions: UserActions;

  // backwards-compatible rating fields
  ratingsCount: number;
  ratings?: Record<string, number>;

  /**
   * ✅ Affinity maps used by your existing /api/user/rate route
   * These names MUST match what that file expects.
   */
  dirAff: Record<string, number>;
  castAff: Record<string, number>;
  decadeAff: Record<string, number>;

  // optional: if you use feel centroid in personalization
  feelCentroid?: number[] | null;
};

const moviesById = new Map<number, MovieRecord>();
const usersById = new Map<string, UserRecord>();

/** MOVIES */
export function getMovie(tmdbId: number): MovieRecord | undefined {
  return moviesById.get(tmdbId);
}

export function upsertMovie(movie: MovieRecord): void {
  moviesById.set(movie.tmdbId, movie);
}

export function getAllMovies(): MovieRecord[] {
  return Array.from(moviesById.values());
}

/** USERS */
export function getOrCreateUser(userId: string): UserRecord {
  const key = (userId || "default").toString();

  const existing = usersById.get(key);
  if (existing) return existing;

  const created: UserRecord = {
    id: key,
    userId: key,
    createdAt: Date.now(),
    actions: { saved: [], disliked: [] },
    ratingsCount: 0,
    ratings: {},

    // ✅ initialize maps your rate route expects
    dirAff: {},
    castAff: {},
    decadeAff: {}
  };

  usersById.set(key, created);
  return created;
}

/**
 * Backwards compatibility:
 * some routes call saveUser(u) after mutating it.
 * In memory cache doesn't need it, but we keep it to avoid build breaks.
 */
export function saveUser(u: UserRecord): void {
  const key = (u.id || u.userId || "default").toString();

  u.id = key;
  u.userId = key;

  u.actions = u.actions ?? { saved: [], disliked: [] };
  u.actions.saved = u.actions.saved ?? [];
  u.actions.disliked = u.actions.disliked ?? [];

  u.ratings = u.ratings ?? {};
  u.ratingsCount = u.ratingsCount ?? Object.keys(u.ratings).length;

  // ✅ ensure affinity maps exist
  u.dirAff = u.dirAff ?? {};
  u.castAff = u.castAff ?? {};
  u.decadeAff = u.decadeAff ?? {};

  usersById.set(key, u);
}

/** ACTIONS */
export function getUserActions(userId: string): UserActions {
  const u = getOrCreateUser(userId);
  u.actions = u.actions ?? { saved: [], disliked: [] };
  u.actions.saved = u.actions.saved ?? [];
  u.actions.disliked = u.actions.disliked ?? [];
  return u.actions;
}

export function toggleUserSaved(userId: string, tmdbId: number): UserRecord {
  const u = getOrCreateUser(userId);

  const saved = new Set(u.actions.saved ?? []);
  const disliked = new Set(u.actions.disliked ?? []);

  if (saved.has(tmdbId)) saved.delete(tmdbId);
  else saved.add(tmdbId);

  // if saved, remove from disliked
  disliked.delete(tmdbId);

  u.actions.saved = Array.from(saved);
  u.actions.disliked = Array.from(disliked);

  saveUser(u);
  return u;
}

export function toggleUserDisliked(userId: string, tmdbId: number): UserRecord {
  const u = getOrCreateUser(userId);

  const saved = new Set(u.actions.saved ?? []);
  const disliked = new Set(u.actions.disliked ?? []);

  if (disliked.has(tmdbId)) disliked.delete(tmdbId);
  else disliked.add(tmdbId);

  // if disliked, remove from saved
  saved.delete(tmdbId);

  u.actions.saved = Array.from(saved);
  u.actions.disliked = Array.from(disliked);

  saveUser(u);
  return u;
}

/** Optional helper for rating routes */
export function setUserRating(userId: string, tmdbId: number, value: number): UserRecord {
  const u = getOrCreateUser(userId);
  u.ratings = u.ratings ?? {};

  u.ratings[String(tmdbId)] = value;
  u.ratingsCount = Object.keys(u.ratings).length;

  saveUser(u);
  return u;
}

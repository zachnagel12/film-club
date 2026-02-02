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

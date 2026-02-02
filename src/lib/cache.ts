// lib/cache.ts
import type { MovieRecord, UserActions } from "./types";

/**
 * In-memory cache (simple + reliable).
 * If you later swap to Redis/DB, keep the same exported functions.
 */

type UserRecord = {
  id: string;
  createdAt: number;
  actions: UserActions;
  // You may already store more personalization data here; keep it additive.
  // Example placeholders:
  feelCentroid?: number[] | null;
  directorAff?: Record<string, number>;
  actorAff?: Record<string, number>;
  decadeAff?: Record<string, number>;
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
  const id = userId || "default";
  const existing = usersById.get(id);
  if (existing) return existing;

  const created: UserRecord = {
    id,
    createdAt: Date.now(),
    actions: { saved: [], disliked: [] }
  };

  usersById.set(id, created);
  return created;
}

export function getUserActions(userId: string): UserActions {
  const u = getOrCreateUser(userId);
  // Defensive: if actions missing for any reason
  u.actions = u.actions ?? { saved: [], disliked: [] };
  return u.actions;
}

export function toggleUserSaved(userId: string, tmdbId: number): UserRecord {
  const u = getOrCreateUser(userId);
  u.actions = u.actions ?? { saved: [], disliked: [] };

  const saved = new Set(u.actions.saved ?? []);
  if (saved.has(tmdbId)) saved.delete(tmdbId);
  else saved.add(tmdbId);

  // If saved, ensure it is NOT disliked
  const disliked = new Set(u.actions.disliked ?? []);
  disliked.delete(tmdbId);

  u.actions.saved = Array.from(saved);
  u.actions.disliked = Array.from(disliked);
  return u;
}

export function toggleUserDisliked(userId: string, tmdbId: number): UserRecord {
  const u = getOrCreateUser(userId);
  u.actions = u.actions ?? { saved: [], disliked: [] };

  const disliked = new Set(u.actions.disliked ?? []);
  if (disliked.has(tmdbId)) disliked.delete(tmdbId);
  else disliked.add(tmdbId);

  // If disliked, remove from saved
  const saved = new Set(u.actions.saved ?? []);
  saved.delete(tmdbId);

  u.actions.saved = Array.from(saved);
  u.actions.disliked = Array.from(disliked);
  return u;
}

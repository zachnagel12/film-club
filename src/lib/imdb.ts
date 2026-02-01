/**
 * IMDb augmentation layer (ratings/votes/budget/box office).
 * Stubbed for now; you can plug in OMDb or IMDb datasets later.
 */

export type IMDbAugment = {
  rating: number | null;
  votes: number | null;
  budget: number | null;
  boxOffice: number | null;
};

export async function fetchIMDbAugment(_tmdbId: number): Promise<IMDbAugment | null> {
  // Intentionally noop. Keep architecture: async augmentation.
  return null;
}

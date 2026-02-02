export type TMDBSearchResult = {
  id: number;
  title: string;
  year: string | null;
  poster: string | null;
  director?: string | null;
};

export type PersonRef = {
  id: number;
  name: string;
};

export type MovieRecord = {
  tmdbId: number;
  title: string;
  year: number | null;
  runtime: number | null;

  overview: string;
  tagline: string;

  poster: string | null;

  genres: { id: number; name: string }[];
  keywords: { id: number; name: string }[];

  directors: PersonRef[];
  writers: PersonRef[];
  castTop: PersonRef[];

  feelVec: number[];
  styleVec: number[];

  imdb?: {
    rating: number | null;
    votes: number | null;
    budget: number | null;
    boxOffice: number | null;
  };

  tmdbVoteAverage: number | null;
  tmdbVoteCount: number | null;

  updatedAt: number;
};

export type RecBreakdown = {
  RecScore: number;
  FeelSim: number;
  DirectionSim: number;
  StyleSim: number;
  DecadeFit: number;
  ActingSim: number;
  Quality: number;
  WorldSim: number;
};

export type Recommendation = {
  tmdbId: number;
  title: string;
  year: number | null;
  poster: string | null;
  directors: string;
  vote_average: number | null;
  vote_count: number | null;

  // ✅ explanations
  reason?: string;
  reasonDetails?: string[];

  // ✅ keep breakdown for debug + confidence bucketing
  breakdown: RecBreakdown;
};

// ✅ super-light user state
export type UserActions = {
  saved: number[];     // tmdbIds
  disliked: number[];  // tmdbIds
};

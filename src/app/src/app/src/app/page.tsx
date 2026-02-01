import SearchBox from "../components/SearchBox";

export default function Page() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Movie Recommendation Generator</h1>
        <p className="mt-2 text-zinc-300">
          Search TMDB, pick a seed, ingest it, then generate Rec v2 recommendations.
        </p>
      </div>

      <SearchBox />
    </main>
  );
}

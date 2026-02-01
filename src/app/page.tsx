import SearchBox from "../components/SearchBox";

export default function Page() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">
        Movie Recommendation Generator
      </h1>
      <p className="mt-2 text-zinc-400">
        Search a movie, ingest it, and generate Rec v2 recommendations.
      </p>

      <div className="mt-6">
        <SearchBox />
      </div>
    </main>
  );
}

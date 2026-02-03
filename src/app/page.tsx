export default function HomePage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-semibold">Movie Recommendation Generator</h1>
        <p className="text-white/60 mt-2">
          This is the main Film Club experience. (We’ll build the generator UI here next.)
        </p>

        <div className="mt-8 border border-white/10 rounded-2xl p-6 bg-white/5">
          <p className="text-white/70">
            Next step: search a movie, select it, generate recommendations.
          </p>
        </div>
      </div>
    </main>
  );
}

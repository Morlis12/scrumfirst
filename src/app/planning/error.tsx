"use client";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="rounded-xl border border-red-200 bg-red-50 p-5">
        <h1 className="font-semibold text-red-800">Action refusée par le backend</h1>
        <p className="mt-1 text-sm text-red-700">{error.message}</p>
        <button
          onClick={reset}
          className="mt-3 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-800"
        >
          Réessayer
        </button>
      </div>
    </main>
  );
}

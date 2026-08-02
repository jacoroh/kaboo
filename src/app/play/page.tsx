"use client";

import dynamic from "next/dynamic";

// The table deals a random hand, so it can only ever run in the browser.
// Next.js pre-renders pages on the server by default; a deck shuffled on
// the server would never match the one the browser shuffles, and React
// throws away the whole page when the two disagree (a "hydration
// mismatch"). `ssr: false` tells Next.js not to pre-render this one —
// visitors see the placeholder below until the table loads.
const PlayTable = dynamic(() => import("@/components/play-table"), {
  ssr: false,
  loading: () => (
    <main className="flex-1 bg-felt text-white">
      <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center gap-2 px-4 py-6">
        <h1 className="text-2xl font-extrabold tracking-[0.35em]">KABOO</h1>
        <p className="text-sm text-white/60">Shuffling…</p>
      </div>
    </main>
  ),
});

export default function PlayPage() {
  return <PlayTable />;
}

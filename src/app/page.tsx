import Link from "next/link";

import { PlayingCard } from "@/components/playing-card";

// The homepage. This is a Server Component — Next.js renders it to real HTML
// on the server, so Google reads finished text instead of an empty page.
// That is the entire reason we moved off Expo.

const STEPS = [
  {
    title: "You get 4 cards, face down",
    body: "Peek at exactly two of them, memorise them, and put them back. From then on you are playing from memory.",
  },
  {
    title: "Swap cards you can't see",
    body: "Draw a card each turn and blind-swap it into your hand, hoping you replaced something worse than what you drew.",
  },
  {
    title: "Call Kaboo when you're lowest",
    body: "Think you have the lowest total? Call it. Everyone gets one last turn — and if you're wrong, it costs you 10 points.",
  },
];

export default function Home() {
  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="bg-felt-deep text-white">
        <div className="mx-auto max-w-4xl px-6 py-16 sm:py-24 text-center">
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight">
            Kaboo
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-white/80 max-w-xl mx-auto">
            A quick memory and strategy card game. Lowest hand wins — but you
            can only remember half of it.
          </p>

          <div className="mt-8 flex justify-center gap-2" aria-hidden="true">
            <PlayingCard card={{ rank: "K", suit: "♥" }} />
            <PlayingCard card={{ rank: "3", suit: "♠" }} />
            <PlayingCard faceDown />
            <PlayingCard faceDown />
          </div>

          <Link
            href="/play"
            className="mt-10 inline-block rounded-xl bg-gold px-10 py-4 text-lg font-bold text-ink shadow-lg transition hover:brightness-105 hover:-translate-y-0.5"
          >
            Play now
          </Link>
          <p className="mt-3 text-sm text-white/60">
            Free · No account · Works on your phone
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <h2 className="text-2xl font-bold text-center">How it works</h2>
        <ol className="mt-10 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="rounded-2xl border border-line bg-surface p-6"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-felt font-bold text-white">
                {i + 1}
              </span>
              <h3 className="mt-4 font-bold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* SEO copy — real sentences people actually search for */}
      <section className="bg-surface border-t border-line">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="text-2xl font-bold">
            Like Cabo, playable online for free
          </h2>
          <div className="mt-4 space-y-4 text-muted leading-relaxed">
            <p>
              If you have played the Cabo card game, you already know the shape
              of Kaboo: a standard 52-card deck, four cards you mostly cannot
              see, and a race to hold the lowest total when someone calls it.
            </p>
            <p>
              Kaboo is played with 2–5 players. Aces are worth 1, number cards
              their face value, Jacks and Queens 10 — and Kings split the game
              wide open: a red King is worth <strong>minus one</strong>, while a
              black King is a brutal 13. Sevens and eights let you peek at your
              own cards, nines and tens at somebody else&apos;s, and Jacks,
              Queens and Kings let you swap cards straight out of an
              opponent&apos;s hand.
            </p>
            <p>
              A round takes about five minutes. No download and no sign-up —
              open the page and play in your browser, on a phone or a laptop.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-4xl px-6 py-8 text-sm text-muted">
          Kaboo — an original card game by Jacob Rohde.
        </div>
      </footer>
    </main>
  );
}

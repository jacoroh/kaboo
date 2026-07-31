"use client";

import { useState } from "react";
import Link from "next/link";

import { PlayingCard } from "@/components/playing-card";
import { buildDeck, Card, cardValue, shuffle } from "@/game/deck";

// "use client" means this page runs in the browser, because it reacts to
// clicks and holds state. The homepage doesn't need that, so it stays on the
// server where it's better for SEO. Mixing the two is normal in Next.js.

type Table = {
  you: Card[];
  bot: Card[];
  discard: Card;
  drawPileSize: number;
};

// Deal a fresh round the way the real rules say: 4 cards each, then one
// card flipped face up to start the discard pile.
function deal(): Table {
  const deck = shuffle(buildDeck());
  return {
    you: deck.slice(0, 4),
    bot: deck.slice(4, 8),
    discard: deck[8],
    drawPileSize: deck.length - 9,
  };
}

export default function PlayPage() {
  const [table, setTable] = useState<Table>(deal);
  const [revealed, setRevealed] = useState<number[]>([]);

  function toggleCard(index: number) {
    setRevealed((current) =>
      current.includes(index)
        ? current.filter((i) => i !== index)
        : [...current, index],
    );
  }

  function newDeal() {
    setTable(deal());
    setRevealed([]);
  }

  const knownTotal = revealed.reduce(
    (sum, i) => sum + cardValue(table.you[i]),
    0,
  );

  return (
    <main className="flex-1 bg-felt-deep text-white">
      <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-8 px-4 py-8">
        <header className="flex items-center justify-between">
          <Link href="/" className="text-sm text-white/70 hover:text-white">
            ← Kaboo
          </Link>
          <button
            type="button"
            onClick={newDeal}
            className="rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold transition hover:bg-white/25"
          >
            New deal
          </button>
        </header>

        {/* Opponent */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-white/70">
            Bot · {table.bot.length} cards
          </h2>
          <div className="flex gap-2">
            {table.bot.map((_, i) => (
              <PlayingCard key={i} faceDown />
            ))}
          </div>
        </section>

        {/* Piles */}
        <section className="flex items-center justify-center gap-8 rounded-2xl bg-felt py-6 ring-1 ring-white/10">
          <div className="text-center">
            <PlayingCard faceDown />
            <p className="mt-2 text-xs text-white/70">
              Draw · {table.drawPileSize}
            </p>
          </div>
          <div className="text-center">
            <PlayingCard card={table.discard} />
            <p className="mt-2 text-xs text-white/70">Discard</p>
          </div>
        </section>

        {/* Your hand */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-white/70">
            You · {table.you.length} cards
          </h2>
          <div className="flex gap-2">
            {table.you.map((card, i) => (
              <PlayingCard
                key={i}
                card={card}
                faceDown={!revealed.includes(i)}
                onClick={() => toggleCard(i)}
              />
            ))}
          </div>
          <p className="mt-3 text-sm text-white/70">
            {revealed.length === 0
              ? "Tap a card to look at it."
              : `Showing ${revealed.length} of 4 — those cards total ${knownTotal}.`}
          </p>
        </section>

        <p className="mt-auto rounded-xl bg-black/20 p-4 text-sm text-white/60">
          <strong className="text-white/80">Work in progress.</strong> The full
          turn loop, the action-card powers, the matching rule and the bot are
          already built and are being moved over here next.
        </p>
      </div>
    </main>
  );
}

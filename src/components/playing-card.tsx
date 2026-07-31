"use client";

import { Card, isRed } from "@/game/deck";

// The one card component used everywhere: hands, draw pile, discard pile.
// This is the React Native version rewritten for the web — the logic is
// identical, only View/Text/StyleSheet became div/span/CSS classes.
//   card      — which card this is (undefined = an empty slot)
//   faceDown  — show the back instead of the face
//   onClick   — what happens when it's clicked or tapped
type PlayingCardProps = {
  card?: Card;
  faceDown?: boolean;
  onClick?: () => void;
};

const BASE = "w-16 h-23 rounded-lg flex items-center justify-center shrink-0";

export function PlayingCard({ card, faceDown = false, onClick }: PlayingCardProps) {
  // Empty slot (e.g. discard pile before any card is played)
  if (!card) {
    return <div className={`${BASE} border-2 border-dashed border-white/35`} />;
  }

  if (faceDown) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Face-down card"
        className={`${BASE} bg-card-back border-2 border-white shadow-sm transition
          ${onClick ? "cursor-pointer hover:-translate-y-1" : "cursor-default"}`}
      >
        <span className="w-12 h-19 rounded border-[1.5px] border-white/60 flex items-center justify-center text-[26px] font-bold text-white/85">
          K
        </span>
      </button>
    );
  }

  const color = isRed(card) ? "text-card-red" : "text-card-black";
  const label = `${card.rank}${card.suit}`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`${BASE} relative bg-card-face border border-line shadow-sm transition
        ${onClick ? "cursor-pointer hover:-translate-y-1" : "cursor-default"} ${color}`}
    >
      <span className="absolute top-1 left-1.5 text-[13px] font-bold leading-3.5 text-left">
        {card.rank}
        <br />
        {card.suit}
      </span>
      <span className="text-3xl">{card.suit}</span>
      <span className="absolute bottom-1 right-1.5 text-[13px] font-bold leading-3.5 text-right rotate-180">
        {card.rank}
        <br />
        {card.suit}
      </span>
    </button>
  );
}

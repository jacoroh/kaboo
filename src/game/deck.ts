// Pure game logic for Kaboo — no visuals here, just rules.
// Keeping rules separate from UI means we can reuse this exact file
// later for the multiplayer server.

export type Suit = '♥' | '♦' | '♠' | '♣';
export type Rank =
  | 'A' | '2' | '3' | '4' | '5' | '6'
  | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export type Card = {
  rank: Rank;
  suit: Suit;
};

export const SUITS: Suit[] = ['♥', '♦', '♠', '♣'];
export const RANKS: Rank[] = [
  'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K',
];

// Kaboo point values: Ace 1, number cards face value, J/Q 10,
// red King -1, black King 13.
export function cardValue(card: Card): number {
  if (card.rank === 'K') {
    return card.suit === '♥' || card.suit === '♦' ? -1 : 13;
  }
  if (card.rank === 'J' || card.rank === 'Q') return 10;
  if (card.rank === 'A') return 1;
  return Number(card.rank);
}

export function isRed(card: Card): boolean {
  return card.suit === '♥' || card.suit === '♦';
}

// Which power a rank grants — only when drawn from the face-down
// draw pile and discarded immediately without swapping.
export type Power = 'peekOwn' | 'peekOther' | 'blindSwap' | 'kingSwap';

export function powerOf(rank: Rank): Power | null {
  if (rank === '7' || rank === '8') return 'peekOwn';
  if (rank === '9' || rank === '10') return 'peekOther';
  if (rank === 'J' || rank === 'Q') return 'blindSwap';
  if (rank === 'K') return 'kingSwap';
  return null;
}

// A full 52-card deck, in order.
export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

// Fisher–Yates shuffle: walk the deck backwards and swap each card
// with a random one before it. Every ordering is equally likely.
export function shuffle(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

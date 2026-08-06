// The bot opponent's brain. Pure logic, no UI — it gets the current
// table, plays one full turn by the same rules as a human, and returns
// the new table plus a narration of everything a real opponent would
// have seen it do (and nothing more).
//
// Fair play: the bot only "knows" cards it has legitimately seen:
//   known[i]       — its own slots (opening peek, 7/8 peeks, watched swaps)
//   playerKnown[i] — the PLAYER's slots (9/10 peeks, King looks, cards
//                    it handed over, cards taken publicly from the discard)
// Knowledge moves with the cards and is wiped when an unseen card
// arrives in a slot.

import { Card, cardValue, powerOf, shuffle } from './deck';

export type BotTurnInput = {
  botHand: Card[];
  playerHand: Card[];
  drawPile: Card[];
  discardPile: Card[];
  known: boolean[];
  playerKnown: boolean[];
  canCallKaboo: boolean;
  turnNumber: number;
};

export type BotTurnResult = {
  botHand: Card[];
  playerHand: Card[];
  drawPile: Card[];
  discardPile: Card[];
  known: boolean[];
  playerKnown: boolean[];
  calledKaboo: boolean;
  message: string;
};

type TableState = {
  botHand: Card[];
  playerHand: Card[];
  drawPile: Card[];
  discardPile: Card[];
  known: boolean[];
  playerKnown: boolean[];
};

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
const fmt = (card: Card) => `${card.rank}${card.suit}`;
const randomIndex = (length: number) => Math.floor(Math.random() * length);

// What the bot assumes an unseen card is worth (deck average ≈ 6.3).
const UNKNOWN_ESTIMATE = 6.3;

// The bot's worst known slot — its favorite card to get rid of.
function worstKnownSlot(hand: Card[], known: boolean[]): number {
  let worst = -1;
  for (let i = 0; i < hand.length; i++) {
    if (known[i] && (worst === -1 || cardValue(hand[i]) > cardValue(hand[worst]))) {
      worst = i;
    }
  }
  return worst;
}

// Matching rule: slap every card the bot KNOWS matches the discard
// top — its own (hand shrinks) and the player's (bot hands over its
// worst card). Chains until nothing known matches. The bot never
// guesses, so it never draws a penalty card.
function tryMatches(s: TableState, messages: string[]) {
  for (let guard = 0; guard < 12; guard++) {
    const top = s.discardPile[s.discardPile.length - 1];
    if (!top) return;

    const own = s.botHand.findIndex(
      (card, i) => s.known[i] && card.rank === top.rank,
    );
    if (own !== -1) {
      const [card] = s.botHand.splice(own, 1);
      s.known.splice(own, 1);
      s.discardPile.push(card);
      messages.push(
        `⚡ The bot matched its ${fmt(card)} onto the discard pile — down to ${s.botHand.length} cards!`,
      );
      continue;
    }

    const yours = s.playerHand.findIndex(
      (card, i) => s.playerKnown[i] && card.rank === top.rank,
    );
    if (yours !== -1 && s.botHand.length > 0) {
      const [card] = s.playerHand.splice(yours, 1);
      s.playerKnown.splice(yours, 1);
      s.discardPile.push(card);
      // Hand over its worst known card (or a random unknown one).
      let give = worstKnownSlot(s.botHand, s.known);
      if (give === -1) give = randomIndex(s.botHand.length);
      const knewGift = s.known[give];
      const [gift] = s.botHand.splice(give, 1);
      s.known.splice(give, 1);
      s.playerHand.push(gift);
      s.playerKnown.push(knewGift);
      messages.push(
        `⚡ The bot matched YOUR ${fmt(card)} and handed you one of its cards!`,
      );
      continue;
    }

    return;
  }
}

export type BotMatchInput = {
  botHand: Card[];
  playerHand: Card[];
  discardPile: Card[];
  known: boolean[];
  playerKnown: boolean[];
};

export type BotMatchResult = BotMatchInput & {
  matched: boolean;
  message: string;
};

// The final-round match window: after the last turn and before the
// reveal, the discard top stays matchable for a few seconds and BOTH
// sides may slap. This is the same `tryMatches` the bot already runs
// inside its own turn, exposed on its own so the table can fire it once,
// on a delay, without handing the bot a whole extra turn.
//
// No draw pile is involved: the bot only ever slaps cards it KNOWS, so
// it never guesses and never takes a penalty card.
export function botSlapMatches(input: BotMatchInput): BotMatchResult {
  const s: TableState = {
    botHand: [...input.botHand],
    playerHand: [...input.playerHand],
    drawPile: [],
    discardPile: [...input.discardPile],
    known: [...input.known],
    playerKnown: [...input.playerKnown],
  };
  const messages: string[] = [];
  tryMatches(s, messages);
  return {
    botHand: s.botHand,
    playerHand: s.playerHand,
    discardPile: s.discardPile,
    known: s.known,
    playerKnown: s.playerKnown,
    matched: messages.length > 0,
    message: messages.join('\n'),
  };
}

export function botTakeTurn(input: BotTurnInput): BotTurnResult {
  const s: TableState = {
    botHand: [...input.botHand],
    playerHand: [...input.playerHand],
    drawPile: [...input.drawPile],
    discardPile: [...input.discardPile],
    known: [...input.known],
    playerKnown: [...input.playerKnown],
  };
  const messages: string[] = [];

  const result = (calledKaboo = false): BotTurnResult => ({
    ...s,
    calledKaboo,
    message: messages.join('\n'),
  });

  // --- Before anything: slap any matches sitting on the discard ---
  tryMatches(s, messages);
  if (s.botHand.length === 0) {
    messages.push('🤖 The bot is out of cards — KABOO is triggered!');
    return result(input.canCallKaboo);
  }

  // --- Call Kaboo if the hand looks like a winner ---
  const knownSum = s.botHand.reduce(
    (sum, card, i) => sum + (s.known[i] ? cardValue(card) : 0),
    0,
  );
  const unknownCount = s.known.filter((k) => !k).length;
  const estimate = knownSum + unknownCount * UNKNOWN_ESTIMATE;
  const confidentToCall = unknownCount === 0 ? knownSum <= 10 : estimate <= 8;

  if (input.canCallKaboo && input.turnNumber >= 3 && confidentToCall) {
    messages.push('🤖 The bot calls KABOO! You get one last turn…');
    return result(true);
  }

  const worst = worstKnownSlot(s.botHand, s.known);
  const worstValue = worst === -1 ? -Infinity : cardValue(s.botHand[worst]);

  // --- Option 1: take a visibly good card from the discard pile ---
  const discardTop = s.discardPile[s.discardPile.length - 1];
  if (discardTop && cardValue(discardTop) <= 4 && worstValue > cardValue(discardTop)) {
    s.discardPile = s.discardPile.slice(0, -1);
    s.discardPile.push(s.botHand[worst]);
    s.botHand[worst] = discardTop;
    s.known[worst] = true;
    messages.push(
      `🤖 The bot took the ${fmt(discardTop)} from the discard pile and swapped its ${ORDINAL[worst]} card`,
    );
    tryMatches(s, messages); // its own discard may enable a chain
    if (s.botHand.length === 0) {
      messages.push('🤖 The bot is out of cards — KABOO is triggered!');
      return result(input.canCallKaboo);
    }
    return result();
  }

  // --- Option 2: draw from the deck ---
  if (s.drawPile.length === 0) {
    const top = s.discardPile[s.discardPile.length - 1];
    s.drawPile = shuffle(s.discardPile.slice(0, -1));
    s.discardPile = [top];
  }
  const drawn = s.drawPile[0];
  s.drawPile = s.drawPile.slice(1);
  const drawnValue = cardValue(drawn);

  // Swap it in if it beats the worst known card...
  if (worst !== -1 && drawnValue < worstValue) {
    s.discardPile.push(s.botHand[worst]);
    s.botHand[worst] = drawn;
    s.known[worst] = true;
    messages.push(
      `🤖 The bot drew from the deck and swapped its ${ORDINAL[worst]} card`,
    );
    tryMatches(s, messages);
    if (s.botHand.length === 0) {
      messages.push('🤖 The bot is out of cards — KABOO is triggered!');
      return result(input.canCallKaboo);
    }
    return result();
  }

  // ...or into an unknown slot if it's a genuinely low card.
  const unknownSlots = s.botHand.map((_, i) => i).filter((i) => !s.known[i]);
  if (drawnValue <= 4 && unknownSlots.length > 0) {
    const slot = unknownSlots[randomIndex(unknownSlots.length)];
    s.discardPile.push(s.botHand[slot]);
    s.botHand[slot] = drawn;
    s.known[slot] = true;
    messages.push(
      `🤖 The bot drew from the deck and swapped its ${ORDINAL[slot]} card`,
    );
    tryMatches(s, messages);
    if (s.botHand.length === 0) {
      messages.push('🤖 The bot is out of cards — KABOO is triggered!');
      return result(input.canCallKaboo);
    }
    return result();
  }

  // --- Otherwise discard it, using its power when useful ---
  s.discardPile.push(drawn);
  const power = powerOf(drawn.rank);

  if (power === 'peekOwn' && unknownSlots.length > 0) {
    s.known[unknownSlots[randomIndex(unknownSlots.length)]] = true;
    messages.push(
      `🤖 The bot discarded the ${fmt(drawn)} and peeked at one of its own cards`,
    );
  } else if (power === 'peekOther' && s.playerHand.length > 0) {
    // Prefer a slot it hasn't seen yet — this feeds its matching game.
    const unseen = s.playerHand.map((_, i) => i).filter((i) => !s.playerKnown[i]);
    const target = unseen.length > 0 ? unseen[randomIndex(unseen.length)] : randomIndex(s.playerHand.length);
    s.playerKnown[target] = true;
    messages.push(
      `🤖 The bot discarded the ${fmt(drawn)} and peeked at your ${ORDINAL[target]} card!`,
    );
  } else if (power === 'blindSwap' && worst !== -1 && worstValue >= 9 && s.playerHand.length > 0) {
    const target = randomIndex(s.playerHand.length);
    const receivedKnown = s.playerKnown[target]; // it may know what it's taking!
    [s.botHand[worst], s.playerHand[target]] = [s.playerHand[target], s.botHand[worst]];
    s.playerKnown[target] = true; // it knew the card it gave away
    s.known[worst] = receivedKnown;
    messages.push(
      `🤖 The bot discarded the ${fmt(drawn)} and BLIND-SWAPPED its ${ORDINAL[worst]} card with your ${ORDINAL[target]} card!`,
    );
  } else if (power === 'kingSwap' && s.playerHand.length > 0) {
    // Sees both cards, swaps only if it comes out ahead — and either
    // way it has now seen both slots.
    const offer = worst !== -1 ? worst : randomIndex(s.botHand.length);
    const target = randomIndex(s.playerHand.length);
    s.known[offer] = true;
    s.playerKnown[target] = true;
    if (cardValue(s.playerHand[target]) < cardValue(s.botHand[offer])) {
      [s.botHand[offer], s.playerHand[target]] = [s.playerHand[target], s.botHand[offer]];
      messages.push(
        `🤖 The bot used its King: swapped its ${ORDINAL[offer]} card with your ${ORDINAL[target]} card!`,
      );
    } else {
      messages.push(
        `🤖 The bot used its King to inspect your ${ORDINAL[target]} card… and kept its own`,
      );
    }
  } else {
    messages.push(`🤖 The bot drew from the deck and discarded the ${fmt(drawn)}`);
  }

  tryMatches(s, messages);
  if (s.botHand.length === 0) {
    messages.push('🤖 The bot is out of cards — KABOO is triggered!');
    return result(input.canCallKaboo);
  }
  return result();
}

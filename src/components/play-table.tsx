"use client";

import { useEffect, useEffectEvent, useState } from "react";
import Link from "next/link";

import { PlayingCard } from "@/components/playing-card";
import { buildDeck, Card, cardValue, powerOf, shuffle } from "@/game/deck";
import { botSlapMatches, botTakeTurn } from "@/game/bot";

// Phases of the round. The screen renders differently in each one.
//   peek        — start of round: memorize 2 of your 4 cards
//   draw        — your turn: take from the draw or discard pile
//   decide      — holding a drawn card: swap it in, or discard it
//   peekOwn     — power (7/8): look at one of your own cards
//   peekOther   — power (9/10): look at one bot card
//   blindSwap   — power (J/Q): trade cards with the bot, unseen
//   kingSwap    — power (K): pick your card + theirs...
//   kingConfirm — ...both revealed to you, then the swap happens:
//                 looking commits you to it (Jacob's ruling 2026-08-02)
//   giveCard    — you matched a bot card: choose one of yours to give
//   botTurn     — the bot is playing its turn
//   finalMatch  — the last turn is played but nothing is revealed yet:
//                 a few counted-down seconds in which either side may
//                 still slap the discard top (Jacob's rule, 2026-08-03)
//   roundOver   — Kaboo was called: all cards revealed, round scored
//   matchOver   — someone crossed 100 points: match decided
type Phase =
  | "peek"
  | "draw"
  | "decide"
  | "peekOwn"
  | "peekOther"
  | "blindSwap"
  | "kingSwap"
  | "kingConfirm"
  | "giveCard"
  | "botTurn"
  | "finalMatch"
  | "roundOver"
  | "matchOver";

const powerLabel = {
  peekOwn: "peek at one of your cards",
  peekOther: "peek at a bot card",
  blindSwap: "blind swap with the bot",
  kingSwap: "see & swap with the bot",
};

// Button styles, shared so every button on the table matches.
const BTN =
  "rounded-full px-6 py-2.5 text-sm font-semibold text-white transition active:scale-95";
const BTN_BASE = `${BTN} bg-black/35 hover:bg-black/50`;
const BTN_SECONDARY = `${BTN} bg-black/20 hover:bg-black/35`;
const BTN_POWER = `${BTN} bg-power hover:brightness-110`;
const BTN_KABOO = `${BTN} bg-kaboo border-2 border-gold hover:brightness-110`;
const BTN_MATCH = `${BTN} bg-match hover:brightness-110`;
const BTN_MATCH_ON = `${BTN} bg-match-on border-2 border-white`;

// How long the bot "thinks" before its move lands. This is also your
// window to slap a match out of turn, so it is a real game mechanic and
// not just decoration.
const BOT_THINKING_MS = 1400;

// The final-round match window. Without it the last discard is dead and
// whoever called Kaboo has already stopped playing; with it the round
// stays live to the final second.
const FINAL_MATCH_SECONDS = 4;
// How long the bot waits before slapping inside that window. Unlike its
// in-turn matching — which resolves instantly and no human can beat —
// this one is deliberately beatable: it is the first place the reaction
// delay of Phase 1.5 actually exists.
const BOT_FINAL_SLAP_MS = 2000;

const handValue = (hand: Card[]) =>
  hand.reduce((sum, card) => sum + cardValue(card), 0);

function deal() {
  const deck = shuffle(buildDeck());
  return {
    hand: deck.slice(0, 4),
    botHand: deck.slice(4, 8),
    discardPile: [deck[8]],
    drawPile: deck.slice(9),
  };
}

// The bot's opening peek: it memorizes 2 random slots of its own hand.
function botOpeningPeek() {
  const known = [false, false, false, false];
  const slots = shuffle([0, 1, 2, 3]).slice(0, 2);
  known[slots[0]] = true;
  known[slots[1]] = true;
  return known;
}

export default function PlayTable() {
  const [table, setTable] = useState(deal);
  const [phase, setPhase] = useState<Phase>("peek");
  const [peeked, setPeeked] = useState<number[]>([]);
  const [drawn, setDrawn] = useState<Card | null>(null);
  const [drawnFrom, setDrawnFrom] = useState<"deck" | "discard" | null>(null);
  // Power selections
  const [revealedOwn, setRevealedOwn] = useState<number | null>(null);
  const [revealedOther, setRevealedOther] = useState<number | null>(null);
  const [swapOwn, setSwapOwn] = useState<number | null>(null);
  const [swapOther, setSwapOther] = useState<number | null>(null);
  // Matching rule
  const [matchMode, setMatchMode] = useState(false);
  const [matchMessage, setMatchMessage] = useState<string | null>(null);
  // The header's "⋯" menu. "Restart round" lives in here rather than on
  // the table because it throws the round away, and it used to sit as a
  // plain button directly under your hand — one mis-aimed tap from the
  // cards you are asked to tap constantly. A menu costs two deliberate
  // taps, which is the point.
  const [menuOpen, setMenuOpen] = useState(false);
  // Where play resumes once a gift has been handed over. Matching is
  // legal OUTSIDE your own turn, so a match made during the bot's
  // thinking pause has to give the bot its turn back — sending play to
  // "draw" instead handed you a second turn and dropped the bot's.
  const [giveReturnPhase, setGiveReturnPhase] = useState<Phase>("draw");
  // The final-round window: seconds left on the clock, and whether the
  // bot has already taken its one slap at it.
  const [finalSecondsLeft, setFinalSecondsLeft] = useState(0);
  const [botSlapped, setBotSlapped] = useState(false);
  // The bot's (fair, partial) knowledge
  const [botKnown, setBotKnown] = useState(botOpeningPeek);
  const [botPlayerKnown, setBotPlayerKnown] = useState([
    false,
    false,
    false,
    false,
  ]);
  const [botMessage, setBotMessage] = useState<string | null>(null);
  const [turnNumber, setTurnNumber] = useState(0);
  // Kaboo & scoring
  const [kabooCaller, setKabooCaller] = useState<"you" | "bot" | null>(null);
  const [scores, setScores] = useState({ you: 0, bot: 0 });
  const [roundResult, setRoundResult] = useState<{
    you: number;
    bot: number;
    penalty: boolean;
    caller: "you" | "bot";
  } | null>(null);

  const discardTop = table.discardPile[table.discardPile.length - 1];

  const availablePower =
    phase === "decide" && drawn && drawnFrom === "deck"
      ? powerOf(drawn.rank)
      : null;

  // ----- scoring -----

  function scoreRound(caller: "you" | "bot", youHand: Card[], botHand: Card[]) {
    const you = handValue(youHand);
    const bot = handValue(botHand);
    // The caller wins only with the STRICTLY lowest total.
    const penalty = caller === "you" ? bot <= you : you <= bot;
    const newScores = {
      you: scores.you + you + (caller === "you" && penalty ? 10 : 0),
      bot: scores.bot + bot + (caller === "bot" && penalty ? 10 : 0),
    };
    setScores(newScores);
    setRoundResult({ you, bot, penalty, caller });
    setPhase(
      newScores.you >= 100 || newScores.bot >= 100 ? "matchOver" : "roundOver",
    );
  }

  // ----- the final-round match window -----

  // The last turn has been played, but nothing is revealed yet. Open the
  // window instead of scoring: for a few counted-down seconds the discard
  // top is still matchable by either side.
  //
  // Nothing about the scores is captured here. The hands are read fresh
  // when the clock runs out, precisely because a slap inside the window
  // is meant to change them.
  function openFinalWindow(youHand: Card[]) {
    setFinalSecondsLeft(FINAL_MATCH_SECONDS);
    setBotSlapped(false);
    // Slapping is the only legal move left, so match mode arms itself —
    // in a four-second window an extra tap just to say "I want to try"
    // is most of the window. The match button still turns it off for
    // anyone who would rather not risk a mis-tap and a penalty card.
    setMatchMode(youHand.length > 0);
    setPhase("finalMatch");
  }

  // A player turn is over: score if this was the last turn after the
  // bot's Kaboo, auto-Kaboo on an empty hand, else hand over to the bot.
  function endPlayerTurn(youHand: Card[] = table.hand) {
    setMatchMode(false);
    if (kabooCaller === "bot") openFinalWindow(youHand);
    else if (youHand.length === 0 && kabooCaller === null) {
      setKabooCaller("you");
      setBotMessage(
        "🎉 You are out of cards — KABOO! The bot gets one last turn…",
      );
      setPhase("botTurn");
    } else setPhase("botTurn");
  }

  // ----- the bot's turn -----

  // What the bot actually does. `useEffectEvent` keeps this OUT of the
  // effect's dependency list while still reading the newest state — so
  // the timer below sees the table as it is when it fires, not as it was
  // when the timer was armed 1.4 seconds earlier.
  const playBotTurn = useEffectEvent(() => {
    const turn = botTakeTurn({
      botHand: table.botHand,
      playerHand: table.hand,
      drawPile: table.drawPile,
      discardPile: table.discardPile,
      known: botKnown,
      playerKnown: botPlayerKnown,
      canCallKaboo: kabooCaller === null,
      turnNumber,
    });
    setTable({
      hand: turn.playerHand,
      botHand: turn.botHand,
      drawPile: turn.drawPile,
      discardPile: turn.discardPile,
    });
    setBotKnown(turn.known);
    setBotPlayerKnown(turn.playerKnown);
    setBotMessage(turn.message);
    setTurnNumber(turnNumber + 1);
    // If you were still holding match mode open when the bot moved, you
    // lost the race. Disarm it — the discard top has just changed, and a
    // tap aimed at the old one would resolve against a card you never
    // looked at — and say so, rather than silently dropping it.
    if (matchMode) {
      setMatchMode(false);
      setMatchMessage("⏱️ Too slow — the bot moved before you tapped.");
    } else {
      setMatchMessage(null);
    }
    if (turn.calledKaboo) {
      setKabooCaller("bot");
      setPhase("draw"); // your one last turn
    } else if (kabooCaller === "you") {
      openFinalWindow(turn.playerHand);
    } else {
      setPhase("draw");
    }
  });

  // Arm the bot's "thinking" pause. The effect watches the PHASE and
  // nothing else, so the timer is armed once when the bot's turn begins
  // and then left alone until that turn ends.
  //
  // `matchMode` used to be a guard and a dependency here, and that was the
  // freeze bug: arming match mode cancelled the bot's timer outright, and
  // cancelling match mode started a fresh full pause. You could hold the
  // clock still for as long as you liked and study the table. Matching is
  // a RACE — a clock the racer can stop is not a race — so match mode now
  // re-renders the screen without touching the running timer, and the bot
  // moves exactly when it said it would.
  //
  // The one interruption left is `giveCard`: winning a match against a bot
  // card genuinely pauses play while you choose a card to hand back, and
  // the phase change clears the timer. Returning to `botTurn` then costs
  // the bot a fresh pause — bounded and self-limiting, since every such
  // interruption spends one of your own cards.
  useEffect(() => {
    if (phase !== "botTurn") return;
    const timer = setTimeout(playBotTurn, BOT_THINKING_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // ----- the final window's clock -----

  // Scoring reads the hands as they stand when the clock hits zero, not
  // as they were when the window opened — a slap inside the window is
  // supposed to change the score.
  const closeFinalWindow = useEffectEvent(() => {
    if (!kabooCaller) return;
    setMatchMode(false);
    scoreRound(kabooCaller, table.hand, table.botHand);
  });

  // One tick per second, so the number on screen is the real clock and
  // not a decoration running next to a separate timer.
  //
  // The countdown PAUSES while you are choosing a card to give the bot
  // (`giveCard` is a different phase, so this effect tears down), and
  // resumes on the second it stopped at rather than restarting — winning
  // a match should not also buy you a fresh window.
  useEffect(() => {
    if (phase !== "finalMatch") return;
    const timer = setTimeout(() => {
      if (finalSecondsLeft <= 1) closeFinalWindow();
      else setFinalSecondsLeft(finalSecondsLeft - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [phase, finalSecondsLeft]);

  // The bot's one slap at the final window. It only ever slaps cards it
  // knows, so it cannot guess wrong and cannot take a penalty here.
  const botFinalSlap = useEffectEvent(() => {
    setBotSlapped(true);
    const slap = botSlapMatches({
      botHand: table.botHand,
      playerHand: table.hand,
      discardPile: table.discardPile,
      known: botKnown,
      playerKnown: botPlayerKnown,
    });
    if (!slap.matched) return;
    setTable({
      ...table,
      hand: slap.playerHand,
      botHand: slap.botHand,
      discardPile: slap.discardPile,
    });
    setBotKnown(slap.known);
    setBotPlayerKnown(slap.playerKnown);
    setBotMessage(slap.message);
  });

  useEffect(() => {
    if (phase !== "finalMatch" || botSlapped) return;
    const timer = setTimeout(botFinalSlap, BOT_FINAL_SLAP_MS);
    return () => clearTimeout(timer);
  }, [phase, botSlapped]);

  // ----- peek phase -----

  // You get exactly TWO looks at your own hand, and a look is spent the
  // moment you take it — there is no putting a card back to win the look
  // again. `peeked` therefore only ever grows: it is the record of what
  // you have SEEN, not of what happens to be face-up right now. (Letting
  // it shrink was a real bug: hide both cards and the counter fell back
  // to 0/2, so you could go on to see all four before the round began.)
  function peekCard(index: number) {
    if (peeked.length >= 2 || peeked.includes(index)) return;
    setPeeked([...peeked, index]);
  }

  function startTurns() {
    setPeeked([]);
    if (Math.random() < 0.5) {
      setBotMessage("🤖 The bot goes first…");
      setPhase("botTurn");
    } else {
      setBotMessage("You go first!");
      setPhase("draw");
    }
  }

  // ----- the matching rule -----

  // Tapping a card while match mode is armed. Correct guess: the card
  // goes to the discard pile (and if it was the bot's, you then give
  // one of yours away). Wrong: a face-down penalty card joins your hand.
  function attemptMatch(who: "you" | "bot", index: number) {
    if (!discardTop) return;
    const card = who === "you" ? table.hand[index] : table.botHand[index];

    if (card.rank !== discardTop.rank) {
      let drawPile = table.drawPile;
      let discardPile = table.discardPile;
      if (drawPile.length === 0) {
        drawPile = shuffle(discardPile.slice(0, -1));
        discardPile = discardPile.slice(-1);
      }
      const hand = [...table.hand, drawPile[0]];
      setTable({ ...table, hand, drawPile: drawPile.slice(1), discardPile });
      setBotPlayerKnown([...botPlayerKnown, false]);
      setMatchMessage(
        `❌ Wrong — that wasn't a ${discardTop.rank}. Penalty card added, you now have ${hand.length}.`,
      );
      setMatchMode(false);
      return;
    }

    if (who === "you") {
      const hand = [...table.hand];
      hand.splice(index, 1);
      const playerKnown = [...botPlayerKnown];
      playerKnown.splice(index, 1);
      setTable({ ...table, hand, discardPile: [...table.discardPile, card] });
      setBotPlayerKnown(playerKnown);
      setPeeked([]); // slot indexes shifted — forget the peek highlight
      setMatchMessage(
        hand.length === 0
          ? `⚡ MATCH! Your last card is gone — KABOO!`
          : `⚡ MATCH! Your ${card.rank}${card.suit} is gone — down to ${hand.length} cards.`,
      );
      setMatchMode(false);
      // Emptying your hand normally auto-triggers Kaboo. Inside the final
      // window it changes nothing extra — a 0-card hand already scores 0,
      // and the round is already ending — so the clock just keeps running.
      if (hand.length === 0 && phase !== "finalMatch") endPlayerTurn(hand);
      return;
    }

    // You have nothing left to hand over, so matching a bot card cannot
    // be paid for. Only reachable inside the final window, where it also
    // gains you nothing: your hand is empty and already scores 0.
    if (table.hand.length === 0) {
      setMatchMessage("You have no cards left to give — leave the bot's alone.");
      return;
    }

    // Matched a bot card: it goes to the discard, then you gift one.
    const botHand = [...table.botHand];
    botHand.splice(index, 1);
    const known = [...botKnown];
    known.splice(index, 1);
    setTable({ ...table, botHand, discardPile: [...table.discardPile, card] });
    setBotKnown(known);
    setMatchMessage(
      `⚡ MATCH! The bot's ${card.rank}${card.suit} is gone — now give it one of yours.`,
    );
    setMatchMode(false);
    // Matching is legal outside your own turn, so the gift must hand play
    // back to whatever it interrupted — your turn, the bot's thinking
    // pause, or the final window with its clock still part-run.
    setGiveReturnPhase(phase);
    setPhase("giveCard");
  }

  // You matched a bot card — hand one of yours over, face-down.
  function giveCard(index: number) {
    const hand = [...table.hand];
    const [gift] = hand.splice(index, 1);
    const playerKnown = [...botPlayerKnown];
    playerKnown.splice(index, 1);
    const botHand = [...table.botHand, gift];
    setTable({ ...table, hand, botHand });
    setBotPlayerKnown(playerKnown);
    setBotKnown([...botKnown, false]); // the bot can't see what it got
    setPeeked([]);
    setMatchMessage(
      `🎁 Card handed over — you have ${hand.length}, the bot has ${botHand.length}.`,
    );
    // Same rule as a self-match: giving your last card away inside the
    // final window is not an auto-Kaboo, it is just a 0-card hand.
    if (hand.length === 0 && giveReturnPhase !== "finalMatch")
      endPlayerTurn(hand);
    else {
      // Back into the window with match mode still armed: the card you
      // matched is the new discard top, and chaining off it is legal.
      if (giveReturnPhase === "finalMatch") setMatchMode(hand.length > 0);
      setPhase(giveReturnPhase);
    }
  }

  // ----- draw phase -----

  function drawFromDeck() {
    let drawPile = table.drawPile;
    let discardPile = table.discardPile;
    if (drawPile.length === 0) {
      drawPile = shuffle(discardPile.slice(0, -1));
      discardPile = discardPile.slice(-1);
    }
    setDrawn(drawPile[0]);
    setDrawnFrom("deck");
    setTable({ ...table, drawPile: drawPile.slice(1), discardPile });
    setPhase("decide");
  }

  function drawFromDiscard() {
    if (table.discardPile.length === 0) return;
    setDrawn(discardTop);
    setDrawnFrom("discard");
    setTable({ ...table, discardPile: table.discardPile.slice(0, -1) });
    setPhase("decide");
  }

  function callKaboo() {
    setKabooCaller("you");
    setBotMessage("You called KABOO! The bot gets one last turn…");
    setPhase("botTurn");
  }

  // ----- decide phase -----

  function swapInto(index: number) {
    if (!drawn) return;
    const hand = [...table.hand];
    const replaced = hand[index];
    hand[index] = drawn;
    const playerKnown = [...botPlayerKnown];
    playerKnown[index] = false; // the bot didn't see what you swapped in
    setTable({ ...table, hand, discardPile: [...table.discardPile, replaced] });
    setBotPlayerKnown(playerKnown);
    setDrawn(null);
    setDrawnFrom(null);
    endPlayerTurn(hand);
  }

  function discardDrawn(usePower: boolean) {
    if (!drawn) return;
    const power = usePower ? powerOf(drawn.rank) : null;
    setTable({ ...table, discardPile: [...table.discardPile, drawn] });
    setDrawn(null);
    setDrawnFrom(null);
    if (power) setPhase(power);
    else endPlayerTurn();
  }

  // ----- power phases -----

  function clearPowerSelections() {
    setRevealedOwn(null);
    setRevealedOther(null);
    setSwapOwn(null);
    setSwapOther(null);
  }

  function endPower() {
    clearPowerSelections();
    endPlayerTurn();
  }

  function doBlindSwap(otherIndex: number) {
    if (swapOwn === null) return;
    const hand = [...table.hand];
    const botHand = [...table.botHand];
    [hand[swapOwn], botHand[otherIndex]] = [botHand[otherIndex], hand[swapOwn]];
    const known = [...botKnown];
    const playerKnown = [...botPlayerKnown];
    // Knowledge travels with the cards: the bot knew what it gave you.
    playerKnown[swapOwn] = known[otherIndex];
    known[otherIndex] = false;
    setTable({ ...table, hand, botHand });
    setBotKnown(known);
    setBotPlayerKnown(playerKnown);
    clearPowerSelections();
    endPlayerTurn(hand);
  }

  function doKingSwap() {
    if (swapOwn === null || swapOther === null) return;
    const hand = [...table.hand];
    const botHand = [...table.botHand];
    [hand[swapOwn], botHand[swapOther]] = [botHand[swapOther], hand[swapOwn]];
    const known = [...botKnown];
    const playerKnown = [...botPlayerKnown];
    playerKnown[swapOwn] = known[swapOther];
    known[swapOther] = false;
    setTable({ ...table, hand, botHand });
    setBotKnown(known);
    setBotPlayerKnown(playerKnown);
    clearPowerSelections();
    endPlayerTurn(hand);
  }

  function newRound(resetScores: boolean) {
    if (resetScores) setScores({ you: 0, bot: 0 });
    setTable(deal());
    setPeeked([]);
    setDrawn(null);
    setDrawnFrom(null);
    clearPowerSelections();
    setMatchMode(false);
    setMatchMessage(null);
    setMenuOpen(false);
    setGiveReturnPhase("draw");
    setFinalSecondsLeft(0);
    setBotSlapped(false);
    setBotKnown(botOpeningPeek());
    setBotPlayerKnown([false, false, false, false]);
    setBotMessage(null);
    setTurnNumber(0);
    setKabooCaller(null);
    setRoundResult(null);
    setPhase("peek");
  }

  // ----- taps on cards -----

  function pressOwnCard(index: number) {
    if (matchMode) attemptMatch("you", index);
    else if (phase === "peek") peekCard(index);
    else if (phase === "decide") swapInto(index);
    else if (phase === "giveCard") giveCard(index);
    // A 7 or 8 buys ONE look at your own hand. Once it is taken, further
    // taps do nothing — without this guard each tap simply moved the
    // reveal to another card, so one power showed you your whole hand.
    else if (phase === "peekOwn" && revealedOwn === null) setRevealedOwn(index);
    else if ((phase === "blindSwap" || phase === "kingSwap") && swapOwn === null)
      setSwapOwn(index);
  }

  function pressBotCard(index: number) {
    if (matchMode) attemptMatch("bot", index);
    // Same for a 9 or 10 and the bot's hand — and this is the worse leak
    // of the two, since it exposed the opponent's entire hand for one card.
    else if (phase === "peekOther" && revealedOther === null)
      setRevealedOther(index);
    else if (phase === "blindSwap" && swapOwn !== null) doBlindSwap(index);
    else if (phase === "kingSwap" && swapOwn !== null) {
      setSwapOther(index);
      setPhase("kingConfirm");
    }
  }

  // ----- what to show -----

  const roundEnded = phase === "roundOver" || phase === "matchOver";
  const canMatch =
    !roundEnded &&
    (phase === "draw" || phase === "botTurn" || phase === "finalMatch") &&
    !!discardTop;

  const resultLine = roundResult
    ? (() => {
        const youTotal =
          roundResult.you +
          (roundResult.caller === "you" && roundResult.penalty ? 10 : 0);
        const botTotal =
          roundResult.bot +
          (roundResult.caller === "bot" && roundResult.penalty ? 10 : 0);
        const who = roundResult.caller === "you" ? "Your" : "The bot's";
        const winner =
          youTotal < botTotal
            ? "you win the round! 🎉"
            : youTotal === botTotal
              ? "the round is tied."
              : "the bot takes the round.";
        return `${who} Kaboo: You ${roundResult.you}${
          roundResult.caller === "you" && roundResult.penalty
            ? " (+10 penalty)"
            : ""
        } · Bot ${roundResult.bot}${
          roundResult.caller === "bot" && roundResult.penalty
            ? " (+10 penalty)"
            : ""
        } — ${winner}`;
      })()
    : "";

  const statusText: Record<Phase, string> = {
    peek:
      peeked.length < 2
        ? `Tap 2 of your cards to peek — you only get two looks (${peeked.length}/2)`
        : 'Memorize them, then tap "I\'ve memorized them"',
    draw:
      kabooCaller === "bot"
        ? "🚨 LAST TURN — the bot called Kaboo! Make it count"
        : "Your turn: tap the draw pile or the discard pile",
    decide: "Tap one of your cards to swap — or discard the drawn card",
    peekOwn:
      revealedOwn === null
        ? "Power: tap one of YOUR cards to peek at it"
        : 'Memorize it, then tap "Got it"',
    peekOther:
      revealedOther === null
        ? "Power: tap one of the BOT's cards to peek at it"
        : 'Memorize it, then tap "Got it"',
    blindSwap:
      swapOwn === null
        ? "Blind swap: tap one of YOUR cards to give away"
        : "Now tap the BOT's card to take — no peeking!",
    kingSwap:
      swapOwn === null
        ? "King: tap one of YOUR cards to offer"
        : "Now tap the BOT's card to look at",
    kingConfirm:
      "Only you can see both cards — and looking means you must swap.",
    giveCard: "🎁 Choose one of YOUR cards to give the bot (face-down)",
    botTurn: "🤖 The bot is thinking…",
    // The countdown lives in the status line rather than beside the
    // discard pile: it is the one thing you must not miss, and this line
    // is where you are already looking to find out what you may do.
    finalMatch:
      table.hand.length === 0
        ? `⏳ ${finalSecondsLeft} — last chance… you are out of cards`
        : matchMode
          ? `⏳ ${finalSecondsLeft} — LAST CHANCE: tap any card you think is a ${discardTop?.rank}`
          : `⏳ ${finalSecondsLeft} — last chance to match the ${discardTop?.rank} before the reveal`,
    roundOver: resultLine,
    matchOver: `Match over! You ${scores.you} · Bot ${scores.bot} — ${
      scores.you < scores.bot
        ? "YOU WIN THE MATCH! 🏆"
        : scores.you === scores.bot
          ? "it's a dead tie!"
          : "the bot wins the match. 🤖"
    }`,
  };

  const ownFaceUp = (i: number) =>
    roundEnded ||
    peeked.includes(i) ||
    revealedOwn === i ||
    (phase === "kingConfirm" && swapOwn === i);

  const botFaceUp = (i: number) =>
    roundEnded ||
    revealedOther === i ||
    (phase === "kingConfirm" && swapOther === i);

  const ownSelected = (i: number) =>
    ((phase === "blindSwap" || phase === "kingSwap") && swapOwn === i) ||
    (phase === "peek" && peeked.includes(i)) ||
    (phase === "peekOwn" && revealedOwn === i);

  // Every peek in this game comes with a fixed number of looks, and a
  // look is spent the moment it is taken. Once the budget is gone that
  // hand stops responding to taps entirely and the cards you did not
  // choose dim, so there is no way to quietly buy a second look.
  const ownPeekSpent =
    (phase === "peek" && peeked.length >= 2) ||
    (phase === "peekOwn" && revealedOwn !== null);
  const botPeekSpent = phase === "peekOther" && revealedOther !== null;

  // Which card that look was spent on (the one that stays lit).
  const ownPeekChoice = (i: number) =>
    phase === "peek" ? peeked.includes(i) : revealedOwn === i;

  // A card is wrapped in a coloured ring when it's selectable or selected.
  const ring = (selected: boolean, selectable: boolean) =>
    `rounded-xl ${
      selected
        ? "ring-3 ring-gold"
        : selectable
          ? "ring-3 ring-highlight"
          : "ring-0"
    }`;

  return (
    <main className="flex-1 bg-felt text-white">
      <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center gap-5 px-4 py-6">
        <header className="flex w-full items-center justify-between">
          <Link href="/" className="text-sm text-white/60 hover:text-white">
            ← Home
          </Link>
          <div className="text-center">
            <h1 className="text-2xl font-extrabold tracking-[0.35em]">KABOO</h1>
            <p className="text-xs text-white/60">
              Match: You {scores.you} · Bot {scores.bot} (to 100)
            </p>
          </div>
          {/* Round options. The container keeps its width whether or not
              the button is showing, so the title stays centred. */}
          <div className="relative w-12 text-right">
            {/* Hidden during the bot's turn and the final window: both
                are timed, and a menu is not worth a second of either. */}
            {!roundEnded && phase !== "botTurn" && phase !== "finalMatch" && (
              <button
                type="button"
                aria-label="Round options"
                aria-expanded={menuOpen}
                className="rounded-full px-3 py-1 text-lg leading-none text-white/60 transition hover:bg-black/25 hover:text-white"
                onClick={() => setMenuOpen(!menuOpen)}
              >
                ⋯
              </button>
            )}
            {menuOpen && (
              <>
                {/* Tap anywhere else to dismiss. A button rather than a
                    bare div so it is keyboard-reachable too. */}
                <button
                  type="button"
                  aria-label="Close menu"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-xl bg-felt-edge shadow-lg ring-1 ring-white/15">
                  <button
                    type="button"
                    className="w-full px-4 py-3 text-left text-sm text-white/90 transition hover:bg-black/30"
                    onClick={() => {
                      setMenuOpen(false);
                      newRound(false);
                    }}
                  >
                    Restart round
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Calling Kaboo ends the round and cannot be taken back, so it
            lives up here, far from the hand you spend the game tapping.
            The row keeps its height even when empty — otherwise the whole
            table would jump every time the button appeared. */}
        <div className="flex min-h-11 w-full items-center justify-center">
          {phase === "draw" && kabooCaller === null && !matchMode && (
            <button type="button" className={BTN_KABOO} onClick={callKaboo}>
              Call KABOO!
            </button>
          )}
        </div>

        {/* The bot's hand */}
        <section className="flex flex-col items-center gap-2">
          <p className="text-xs text-white/70">
            Bot 🤖 · {table.botHand.length} cards
          </p>
          <div className="flex min-h-23 flex-wrap justify-center gap-2">
            {table.botHand.map((card, i) => (
              <div
                key={i}
                className={`${ring(
                  phase === "peekOther" && revealedOther === i,
                  matchMode,
                )} ${botPeekSpent && revealedOther !== i ? "opacity-45" : ""}`}
              >
                <PlayingCard
                  card={card}
                  faceDown={!botFaceUp(i)}
                  onClick={botPeekSpent ? undefined : () => pressBotCard(i)}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Middle: draw pile, discard pile, drawn card */}
        <section className="flex justify-center gap-6 sm:gap-8">
          <div className="flex flex-col items-center gap-1.5">
            <PlayingCard
              card={table.drawPile[0] ?? { rank: "A", suit: "♠" }}
              faceDown
              onClick={
                phase === "draw" && !matchMode ? drawFromDeck : undefined
              }
            />
            <p className="text-xs text-white/70">
              Draw ({table.drawPile.length})
            </p>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <PlayingCard
              card={discardTop}
              onClick={
                phase === "draw" && !matchMode ? drawFromDiscard : undefined
              }
            />
            <p className="text-xs text-white/70">Discard</p>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className={drawn ? "rounded-xl ring-3 ring-gold" : undefined}>
              <PlayingCard card={drawn ?? undefined} />
            </div>
            <p className="text-xs text-white/70">Drawn</p>
          </div>
        </section>

        {/* Messages — aria-live so screen readers announce the bot's moves */}
        <div
          className="flex min-h-16 flex-col items-center gap-1 text-center"
          aria-live="polite"
        >
          {matchMessage && !roundEnded && (
            <p className="text-sm font-semibold text-[#85c1e9]">
              {matchMessage}
            </p>
          )}
          {botMessage && !roundEnded && (
            <p className="text-sm text-white/90 italic">{botMessage}</p>
          )}
          {/* The final window writes its own status line, because the
              countdown has to stay visible even with match mode armed. */}
          <p className="text-[15px] font-semibold text-gold">
            {matchMode && phase !== "finalMatch"
              ? `⚡ MATCH MODE — tap any card you think is a ${discardTop?.rank}`
              : statusText[phase]}
          </p>
        </div>

        {/* Your hand */}
        <section className="flex flex-col items-center gap-2">
          <div className="flex min-h-23 flex-wrap justify-center gap-2">
            {table.hand.map((card, i) => (
              <div
                key={i}
                className={`${ring(
                  ownSelected(i),
                  matchMode || phase === "giveCard",
                )} ${ownPeekSpent && !ownPeekChoice(i) ? "opacity-45" : ""}`}
              >
                <PlayingCard
                  card={card}
                  faceDown={!ownFaceUp(i)}
                  onClick={ownPeekSpent ? undefined : () => pressOwnCard(i)}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-white/70">You · {table.hand.length} cards</p>
        </section>

        {/* Phase-specific buttons. Only reversible, in-turn actions live
            here — ⚡ Match stays deliberately close to the cards, because
            matching is a race and a far-away button would lose it for
            you. Extra top padding puts a gap between the cards and the
            row so an over-shot tap lands on nothing. */}
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          {phase === "peek" && (
            <button
              type="button"
              className={`${BTN_BASE} ${peeked.length < 2 ? "opacity-40" : ""}`}
              disabled={peeked.length < 2}
              onClick={startTurns}
            >
              I&apos;ve memorized them
            </button>
          )}

          {canMatch && (
            <button
              type="button"
              className={matchMode ? BTN_MATCH_ON : BTN_MATCH}
              onClick={() => setMatchMode(!matchMode)}
            >
              {matchMode ? "Cancel match" : `⚡ Match a ${discardTop.rank}`}
            </button>
          )}

          {phase === "decide" && availablePower && (
            <button
              type="button"
              className={BTN_POWER}
              onClick={() => discardDrawn(true)}
            >
              Discard &amp; {powerLabel[availablePower]}
            </button>
          )}
          {phase === "decide" && (
            <button
              type="button"
              className={BTN_BASE}
              onClick={() => discardDrawn(false)}
            >
              {availablePower ? "Just discard" : "Discard drawn card"}
            </button>
          )}

          {(phase === "peekOwn" || phase === "peekOther") &&
            (revealedOwn !== null || revealedOther !== null) && (
              <button type="button" className={BTN_BASE} onClick={endPower}>
                Got it
              </button>
            )}

          {(phase === "peekOwn" ||
            phase === "peekOther" ||
            phase === "blindSwap" ||
            phase === "kingSwap") &&
            revealedOwn === null &&
            revealedOther === null && (
              <button
                type="button"
                className={BTN_SECONDARY}
                onClick={endPower}
              >
                Skip power
              </button>
            )}

          {/* One button, not two: the King shows you both cards and the
              swap then happens. The decision you get is whether to use
              the power at all — "Skip power" above, before you look. */}
          {phase === "kingConfirm" && (
            <button type="button" className={BTN_POWER} onClick={doKingSwap}>
              Swap them
            </button>
          )}

          {phase === "roundOver" && (
            <button
              type="button"
              className={BTN_BASE}
              onClick={() => newRound(false)}
            >
              Next round
            </button>
          )}
          {phase === "matchOver" && (
            <button
              type="button"
              className={BTN_BASE}
              onClick={() => newRound(true)}
            >
              New match
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

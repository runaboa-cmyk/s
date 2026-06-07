import { CARDS, type CardType } from "./cards.js";

export interface Player {
  name: string;
  points: number;
}

export interface GameState {
  code: string;
  players: Player[];
  curP: number;
  round: number;
  inPlay: boolean;
  decks: Record<CardType, number[]>;
  activeCard: number | null;
  cardType: CardType | null;
  revealed: boolean;
  chosenAnswer: number | null;
  risicoResult: "ok" | "fail" | null;
  risicoMsg: string | null;
  pendingAction: string | null;
  gameOver: boolean;
  started: boolean;
  hostSocketId: string;
  playerSocketIds: string[];
  playerCorrectAnswers: number[];
  bonusCardsDrawn: number[];
  skippedPlayers: number[];
  turnTimeLeft: number;
  shuffledOpts: number[] | null; // indices into original opts array
}

function shuffle<T>(arr: T[]): T[] {
  const b = [...arr];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function doubleShuffle<T>(arr: readonly T[]): number[] {
  const indices = arr.map((_, i) => i);
  return shuffle([...indices, ...indices]);
}

export function buildInitialState(
  code: string,
  hostName: string,
  hostSocketId: string,
): GameState {
  return {
    code,
    players: [{ name: hostName, points: 0 }],
    playerSocketIds: [hostSocketId],
    playerCorrectAnswers: [0],
    bonusCardsDrawn: [0],
    skippedPlayers: [],
    turnTimeLeft: 0,
    curP: 0,
    round: 1,
    inPlay: false,
    decks: {
      vraag: shuffle(CARDS.vraag.map((_, i) => i)),
      risico: shuffle(CARDS.risico.map((_, i) => i)),
      kennis: shuffle(CARDS.kennis.map((_, i) => i)),
      bonus: doubleShuffle(CARDS.bonus),
      straf: doubleShuffle(CARDS.straf),
    },
    activeCard: null,
    cardType: null,
    revealed: false,
    chosenAnswer: null,
    risicoResult: null,
    risicoMsg: null,
    pendingAction: null,
    gameOver: false,
    started: false,
    hostSocketId,
    shuffledOpts: null,
  };
}

export function applyAddPlayer(
  st: GameState,
  name: string,
  socketId: string,
): GameState {
  return {
    ...st,
    players: [...st.players, { name, points: 0 }],
    playerSocketIds: [...st.playerSocketIds, socketId],
    playerCorrectAnswers: [...st.playerCorrectAnswers, 0],
    bonusCardsDrawn: [...st.bonusCardsDrawn, 0],
  };
}

export function applyHostDraw(st: GameState, type: CardType): GameState {
  if (st.inPlay || st.decks[type].length === 0) return st;
  const deck = [...st.decks[type]];
  const idx = deck.shift()!;
  const bonusCardsDrawn =
    type === "bonus"
      ? st.bonusCardsDrawn.map((n, i) => (i === st.curP ? n + 1 : n))
      : st.bonusCardsDrawn;

  // Shuffle answer options on the server when drawing a vraag card
  let shuffledOpts: number[] | null = null;
  if (type === "vraag") {
    shuffledOpts = shuffle(CARDS.vraag[idx].opts.map((_, i) => i));
  }

  return {
    ...st,
    decks: { ...st.decks, [type]: deck },
    bonusCardsDrawn,
    activeCard: idx,
    cardType: type,
    inPlay: true,
    revealed: false,
    chosenAnswer: null,
    pendingAction: null,
    risicoResult: null,
    risicoMsg: null,
    shuffledOpts,
  };
}

export function applyHostAnswer(st: GameState, choice: number): GameState {
  if (st.cardType !== "vraag" || st.activeCard === null) return st;
  const card = CARDS.vraag[st.activeCard];

  // choice is index into shuffledOpts; map back to original index
  const origChoice = st.shuffledOpts ? st.shuffledOpts[choice] : choice;
  const correct = origChoice === card.ans;

  const pts = correct
    ? st.players[st.curP].points + card.pts
    : st.players[st.curP].points - 1;
  const players = st.players.map((p, i) =>
    i === st.curP ? { ...p, points: pts } : p,
  );
  const playerCorrectAnswers = [...st.playerCorrectAnswers];
  if (correct) playerCorrectAnswers[st.curP]++;
  return { ...st, players, playerCorrectAnswers, chosenAnswer: choice };
}

export function applyHostChooseR(
  st: GameState,
  choice: number,
): { state: GameState; extraDraw: "bonus" | "straf" } {
  if (st.cardType !== "risico" || st.activeCard === null)
    return { state: st, extraDraw: "straf" };
  const card = CARDS.risico[st.activeCard];
  const correct = choice === card.safe;
  return {
    state: {
      ...st,
      chosenAnswer: choice,
      risicoResult: correct ? "ok" : "fail",
      risicoMsg: correct
        ? "✓ CORRECT! Je wint een bonuskaart!"
        : "✗ FOUT! Je krijgt een strafkaart!",
    },
    extraDraw: correct ? "bonus" : "straf",
  };
}

export function clearActiveCard(st: GameState): GameState {
  return {
    ...st,
    inPlay: false,
    activeCard: null,
    cardType: null,
    shuffledOpts: null,
  };
}

export function applyHostApplyBonus(st: GameState): {
  state: GameState;
  extraDraw?: CardType;
} {
  if (st.cardType !== "bonus" || st.activeCard === null) return { state: st };
  const card = CARDS.bonus[st.activeCard];
  if (card.act === "pts") {
    const players = st.players.map((p, i) =>
      i === st.curP ? { ...p, points: p.points + card.pts } : p,
    );
    return { state: { ...st, players, pendingAction: "done" } };
  }
  if (card.act === "extra") {
    return {
      state: {
        ...st,
        inPlay: false,
        activeCard: null,
        cardType: null,
        shuffledOpts: null,
      },
    };
  }
  if (card.act === "extravraag") {
    return {
      state: {
        ...st,
        inPlay: false,
        activeCard: null,
        cardType: null,
        shuffledOpts: null,
      },
      extraDraw: "vraag",
    };
  }
  return { state: st };
}

export function applyHostApplyStraf(st: GameState): GameState {
  if (st.cardType !== "straf" || st.activeCard === null) return st;
  const card = CARDS.straf[st.activeCard];
  const players = st.players.map((p, i) =>
    i === st.curP ? { ...p, points: p.points + card.pts } : p,
  );
  const skippedPlayers = card.skipTurn
    ? [...st.skippedPlayers, st.curP]
    : [...st.skippedPlayers];
  return { ...st, players, skippedPlayers, pendingAction: "done" };
}

export function applyHostApplyKennis(st: GameState): {
  state: GameState;
  extraDraw?: CardType;
} {
  if (st.cardType !== "kennis" || st.activeCard === null) return { state: st };
  const card = CARDS.kennis[st.activeCard];
  let players = [...st.players];
  if (card.bonus === "pt1") {
    players = players.map((p, i) =>
      i === st.curP ? { ...p, points: p.points + 1 } : p,
    );
  } else if (card.bonus === "pt2") {
    players = players.map((p, i) =>
      i === st.curP ? { ...p, points: p.points + 2 } : p,
    );
  }
  if (card.bonus === "extravraag" || card.bonus === "extrabonus") {
    const typ: CardType = card.bonus === "extravraag" ? "vraag" : "bonus";
    return {
      state: {
        ...st,
        players,
        inPlay: false,
        activeCard: null,
        cardType: null,
        shuffledOpts: null,
      },
      extraDraw: typ,
    };
  }
  return { state: { ...st, players, pendingAction: "done" } };
}

export function applyHostNext(st: GameState): GameState {
  let nextCurP = (st.curP + 1) % st.players.length;
  let skippedPlayers = [...st.skippedPlayers];

  if (skippedPlayers.includes(nextCurP)) {
    skippedPlayers = skippedPlayers.filter((i) => i !== nextCurP);
    nextCurP = (nextCurP + 1) % st.players.length;
  }

  const next: GameState = {
    ...st,
    inPlay: false,
    activeCard: null,
    cardType: null,
    chosenAnswer: null,
    risicoResult: null,
    risicoMsg: null,
    pendingAction: null,
    skippedPlayers,
    curP: nextCurP,
    shuffledOpts: null,
  };
  if (nextCurP === 0) next.round = st.round + 1;
  const allEmpty = (["vraag", "risico", "kennis"] as CardType[]).every(
    (t) => next.decks[t].length === 0,
  );
  if (allEmpty) next.gameOver = true;
  return next;
}

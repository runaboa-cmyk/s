export type CardType = "vraag" | "risico" | "kennis" | "bonus" | "straf";

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
  shuffledOpts: number[] | null;
}

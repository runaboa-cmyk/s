import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import {
  buildInitialState,
  applyAddPlayer,
  applyHostDraw,
  applyHostAnswer,
  applyHostChooseR,
  clearActiveCard,
  applyHostApplyBonus,
  applyHostApplyStraf,
  applyHostApplyKennis,
  applyHostNext,
  type GameState,
} from "./state.js";
import type { CardType } from "./cards.js";
import { logger } from "../lib/logger.js";

const TURN_SECONDS = 30;

const games = new Map<string, GameState>();
const turnTimers = new Map<string, ReturnType<typeof setInterval>>();

function genCode(): string {
  return (
    Math.random().toString(36).substr(2, 4).toUpperCase() +
    Math.floor(Math.random() * 90 + 10)
  );
}

function isCurrentPlayer(socket: { id: string }, st: GameState): boolean {
  return socket.id === st.playerSocketIds[st.curP];
}

function isHost(socket: { id: string }, st: GameState): boolean {
  return socket.id === st.hostSocketId;
}

function clearTurnTimer(code: string): void {
  const t = turnTimers.get(code);
  if (t !== undefined) {
    clearInterval(t);
    turnTimers.delete(code);
  }
}

function startTurnTimer(code: string, io: SocketIOServer): void {
  clearTurnTimer(code);

  const interval = setInterval(() => {
    const cur = games.get(code);
    if (!cur || cur.gameOver || !cur.started) {
      clearInterval(interval);
      turnTimers.delete(code);
      return;
    }

    const newTime = cur.turnTimeLeft - 1;

    if (newTime <= 0) {
      clearInterval(interval);
      turnTimers.delete(code);
      const base = applyHostNext({ ...cur, turnTimeLeft: 0 });
      const next = { ...base, turnTimeLeft: TURN_SECONDS };
      games.set(code, next);
      io.to(code).emit("state", next);
      startTurnTimer(code, io);
    } else {
      const updated = { ...cur, turnTimeLeft: newTime };
      games.set(code, updated);
      io.to(code).emit("state", updated);
    }
  }, 1000);

  turnTimers.set(code, interval);
}

export function attachSocketIO(httpServer: HttpServer): void {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*" },
    path: "/socket.io",
  });

  io.on("connection", (socket) => {
    logger.info({ id: socket.id }, "socket connected");

    socket.on(
      "create-game",
      (
        { hostName }: { hostName: string },
        cb: (res: { code: string; state: GameState }) => void
      ) => {
        let code = genCode();
        while (games.has(code)) code = genCode();
        const state = buildInitialState(code, hostName, socket.id);
        games.set(code, state);
        socket.join(code);
        logger.info({ code, hostName }, "game created");
        cb({ code, state });
      }
    );

    socket.on(
      "join-game",
      (
        { code, name }: { code: string; name: string },
        cb: (res: { ok: boolean; state?: GameState; error?: string }) => void
      ) => {
        const st = games.get(code);
        if (!st) { cb({ ok: false, error: "Spelcode niet gevonden." }); return; }
        if (st.started) { cb({ ok: false, error: "Dit spel is al begonnen." }); return; }
        if (st.players.length >= 5) { cb({ ok: false, error: "Spel zit vol (max 5 spelers)." }); return; }
        const playerName = name.trim() || `Speler ${st.players.length + 1}`;
        const updated = applyAddPlayer(st, playerName, socket.id);
        games.set(code, updated);
        socket.join(code);
        logger.info({ code, name: playerName }, "player joined");
        cb({ ok: true, state: updated });
        io.to(code).emit("state", updated);
      }
    );

    socket.on("start-game", ({ code }: { code: string }) => {
      const st = games.get(code);
      if (!st || !isHost(socket, st)) return;
      const next = { ...st, started: true, turnTimeLeft: TURN_SECONDS };
      games.set(code, next);
      io.to(code).emit("state", next);
      startTurnTimer(code, io);
    });

    socket.on(
      "host-draw",
      ({ code, cardType }: { code: string; cardType: CardType }) => {
        const st = games.get(code);
        if (!st || !isCurrentPlayer(socket, st)) return;
        const next = applyHostDraw(st, cardType);
        games.set(code, next);
        io.to(code).emit("state", next);
        // timer naturally pauses because inPlay = true
      }
    );

    socket.on(
      "host-answer",
      ({ code, choice }: { code: string; choice: number }) => {
        const st = games.get(code);
        if (!st || !isCurrentPlayer(socket, st)) return;
        const next = applyHostAnswer(st, choice);
        games.set(code, next);
        io.to(code).emit("state", next);
      }
    );

    // Active player: make a risico choice — auto-draws bonus or straf after 1.5s
    socket.on(
      "host-choose-r",
      ({ code, choice }: { code: string; choice: number }) => {
        const st = games.get(code);
        if (!st || !isCurrentPlayer(socket, st)) return;
        const { state: interim, extraDraw } = applyHostChooseR(st, choice);
        games.set(code, interim);
        io.to(code).emit("state", interim);

        setTimeout(() => {
          const cur = games.get(code);
          if (!cur) return;
          const cleared = clearActiveCard(cur);
          if (cleared.decks[extraDraw].length === 0) {
            const base = applyHostNext(cleared);
            const next = { ...base, turnTimeLeft: TURN_SECONDS };
            games.set(code, next);
            io.to(code).emit("state", next);
            startTurnTimer(code, io);
            return;
          }
          const afterDraw = applyHostDraw(cleared, extraDraw);
          games.set(code, afterDraw);
          io.to(code).emit("state", afterDraw);
          // timer stays paused (inPlay = true for the bonus/straf card)
        }, 1500);
      }
    );

    // Active player: claim bonus card effect
    socket.on("host-apply-bonus", ({ code }: { code: string }) => {
      const st = games.get(code);
      if (!st || !isCurrentPlayer(socket, st)) return;
      const { state: next, extraDraw } = applyHostApplyBonus(st);
      if (extraDraw) {
        const afterDraw = applyHostDraw(next, extraDraw);
        games.set(code, afterDraw);
        io.to(code).emit("state", afterDraw);
        // timer stays paused; next turn timer starts when host-next is called
      } else {
        games.set(code, next);
        io.to(code).emit("state", next);
        if (next.pendingAction === "done") {
          setTimeout(() => {
            const cur = games.get(code);
            if (!cur) return;
            const base = applyHostNext(cur);
            const afterNext = { ...base, turnTimeLeft: TURN_SECONDS };
            games.set(code, afterNext);
            io.to(code).emit("state", afterNext);
            startTurnTimer(code, io);
          }, 600);
        }
      }
    });

    // Active player: acknowledge straf card — applies penalty then advances
    socket.on("host-apply-straf", ({ code }: { code: string }) => {
      const st = games.get(code);
      if (!st || !isCurrentPlayer(socket, st)) return;
      const penalised = applyHostApplyStraf(st);
      const base = applyHostNext(penalised);
      const next = { ...base, turnTimeLeft: TURN_SECONDS };
      games.set(code, next);
      io.to(code).emit("state", next);
      startTurnTimer(code, io);
    });

    // Active player: acknowledge kennis card
    socket.on("host-apply-kennis", ({ code }: { code: string }) => {
      const st = games.get(code);
      if (!st || !isCurrentPlayer(socket, st)) return;
      const { state: next, extraDraw } = applyHostApplyKennis(st);
      if (extraDraw) {
        const afterDraw = applyHostDraw(next, extraDraw);
        games.set(code, afterDraw);
        io.to(code).emit("state", afterDraw);
        // timer stays paused; next turn timer starts when host-next is called
      } else {
        const base = applyHostNext(next);
        const afterNext = { ...base, turnTimeLeft: TURN_SECONDS };
        games.set(code, afterNext);
        io.to(code).emit("state", afterNext);
        startTurnTimer(code, io);
      }
    });

    socket.on("host-next", ({ code }: { code: string }) => {
      const st = games.get(code);
      if (!st || !isCurrentPlayer(socket, st)) return;
      const base = applyHostNext(st);
      const next = { ...base, turnTimeLeft: TURN_SECONDS };
      games.set(code, next);
      io.to(code).emit("state", next);
      startTurnTimer(code, io);
    });

    socket.on("end-game", ({ code }: { code: string }) => {
      const st = games.get(code);
      if (!st || !isHost(socket, st)) return;
      clearTurnTimer(code);
      const next = { ...st, gameOver: true };
      games.set(code, next);
      io.to(code).emit("state", next);
    });

    socket.on("disconnect", () => {
      logger.info({ id: socket.id }, "socket disconnected");
    });
  });
}

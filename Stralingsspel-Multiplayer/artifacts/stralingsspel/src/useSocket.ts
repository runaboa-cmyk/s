import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { GameState } from "./types";

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = io("https://s-060w.onrender.com", {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
    socketRef.current = s;
    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));
    return () => {
      s.disconnect();
    };
  }, []);

  function createGame(
    hostName: string,
    cb: (res: { code: string; state: GameState }) => void
  ) {
    socketRef.current?.emit("create-game", { hostName }, cb);
  }

  function joinGame(
    code: string,
    name: string,
    cb: (res: { ok: boolean; state?: GameState; error?: string }) => void
  ) {
    socketRef.current?.emit("join-game", { code, name }, cb);
  }

  function startGame(code: string) {
    socketRef.current?.emit("start-game", { code });
  }

  function hostDraw(code: string, cardType: string) {
    socketRef.current?.emit("host-draw", { code, cardType });
  }

  function hostAnswer(code: string, choice: number) {
    socketRef.current?.emit("host-answer", { code, choice });
  }

  function hostChooseR(code: string, choice: number) {
    socketRef.current?.emit("host-choose-r", { code, choice });
  }

  function hostApplyBonus(code: string) {
    socketRef.current?.emit("host-apply-bonus", { code });
  }

  function hostApplyStraf(code: string) {
    socketRef.current?.emit("host-apply-straf", { code });
  }

  function hostApplyKennis(code: string) {
    socketRef.current?.emit("host-apply-kennis", { code });
  }

  function hostNext(code: string) {
    socketRef.current?.emit("host-next", { code });
  }

  function endGame(code: string) {
    socketRef.current?.emit("end-game", { code });
  }

  function onState(cb: (state: GameState) => void) {
    socketRef.current?.on("state", cb);
    return () => {
      socketRef.current?.off("state", cb);
    };
  }

  function socketId() {
    return socketRef.current?.id;
  }

  return {
    connected,
    socketId,
    createGame,
    joinGame,
    startGame,
    hostDraw,
    hostAnswer,
    hostChooseR,
    hostApplyBonus,
    hostApplyStraf,
    hostApplyKennis,
    hostNext,
    endGame,
    onState,
  };
}

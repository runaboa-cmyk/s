import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useSocket } from "./useSocket";
import type { GameState, CardType } from "./types";
import { CARDS } from "./cards";
import "./index.css";

type Screen = "lobby" | "waiting" | "viewer-wait" | "game" | "winner";

export default function App() {
  const socket = useSocket();
  const [screen, setScreen] = useState<Screen>("lobby");
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameCode, setGameCode] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [myName, setMyName] = useState("");
  const [mySocketId, setMySocketId] = useState<string | null>(null);

  const [hostName, setHostName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinCode, setJoinCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("code") ?? "";
  });
  const [joinErr, setJoinErr] = useState("");

  const unsubRef = useRef<(() => void) | null>(null);

  function subscribeState(cb: (st: GameState) => void) {
    unsubRef.current?.();
    unsubRef.current = socket.onState(cb);
  }

  function handleStateUpdate(st: GameState) {
    setGameState(st);
    if (st.gameOver) {
      setScreen("winner");
    } else if (st.started) {
      setScreen("game");
    }
  }

  function createGame() {
    const name = hostName.trim() || "Speler 1";
    socket.createGame(name, ({ code, state }) => {
      setGameCode(code);
      setIsHost(true);
      setMyName(name);
      setMySocketId(socket.socketId() ?? null);
      setGameState(state);
      subscribeState(handleStateUpdate);
      setScreen("waiting");
    });
  }

  function joinGame() {
    setJoinErr("");
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setJoinErr("Voer een spelcode in.");
      return;
    }
    const name = joinName.trim() || "Kijker";
    socket.joinGame(code, name, ({ ok, state, error }) => {
      if (!ok || !state) {
        setJoinErr(error || "Onbekende fout.");
        return;
      }
      setGameCode(code);
      setIsHost(false);
      setMyName(name);
      setMySocketId(socket.socketId() ?? null);
      setGameState(state);
      subscribeState(handleStateUpdate);
      if (state.started) setScreen("game");
      else setScreen("viewer-wait");
    });
  }

  function startGame() {
    socket.startGame(gameCode);
  }

  function goHome() {
    setScreen("lobby");
    setGameCode("");
    setGameState(null);
    setIsHost(false);
    setMyName("");
    setMySocketId(null);
    setHostName("");
    setJoinCode("");
    setJoinName("");
    setJoinErr("");
    unsubRef.current?.();
  }

  if (screen === "lobby")
    return (
      <Lobby
        hostName={hostName}
        onHostName={setHostName}
        onCreateGame={createGame}
        joinName={joinName}
        joinCode={joinCode}
        joinErr={joinErr}
        onJoinName={setJoinName}
        onJoinCode={setJoinCode}
        onJoin={joinGame}
        connected={socket.connected}
      />
    );

  if (screen === "waiting" && gameState)
    return (
      <WaitingRoom
        code={gameCode}
        players={gameState.players}
        onStart={startGame}
      />
    );

  if (screen === "viewer-wait" && gameState)
    return <ViewerWait code={gameCode} players={gameState.players} />;

  if (screen === "game" && gameState)
    return (
      <GameScreen
        state={gameState}
        isHost={isHost}
        mySocketId={mySocketId}
        myName={myName}
        code={gameCode}
        socket={socket}
        onEnd={() => {
          socket.endGame(gameCode);
        }}
      />
    );

  if (screen === "winner" && gameState)
    return <WinnerScreen state={gameState} onHome={goHome} />;

  return null;
}

/* ── LOBBY ── */
function Lobby({
  hostName,
  onHostName,
  onCreateGame,
  joinName,
  joinCode,
  joinErr,
  onJoinName,
  onJoinCode,
  onJoin,
  connected,
}: {
  hostName: string;
  onHostName: (v: string) => void;
  onCreateGame: () => void;
  joinName: string;
  joinCode: string;
  joinErr: string;
  onJoinName: (v: string) => void;
  onJoinCode: (v: string) => void;
  onJoin: () => void;
  connected: boolean;
}) {
  return (
    <div className="screen-enter">
      <div className="lobby-center">
        <span className="haz">☢</span>
        <div className="logo">NOVA MAX 3B · H6 · §1 §3 §4</div>
        <h1>STRALINGSSPEL</h1>
        <div className="sub">multiplayer · 3–5 spelers</div>
        {!connected && (
          <div
            style={{
              color: "var(--r)",
              fontSize: 11,
              marginBottom: 8,
              fontFamily: "Orbitron, monospace",
            }}
          >
            ⏳ VERBINDEN...
          </div>
        )}
      </div>

      <div className="card">
        <h2>★ HOST: NIEUW SPEL STARTEN</h2>
        <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 8 }}>
          Voer jouw naam in. Anderen sluiten aan via de spelcode op hun eigen
          laptop.
        </div>
        <input
          type="text"
          placeholder="Jouw naam"
          value={hostName}
          onChange={(e) => onHostName(e.target.value)}
        />
        <button
          className="btn bg"
          style={{ width: "100%" }}
          onClick={onCreateGame}
          disabled={!connected}
        >
          ☢ SPEL AANMAKEN
        </button>
      </div>

      <div className="or-divider">OF</div>

      <div className="card">
        <h2>▶ MEEDOEN MET SPELCODE</h2>
        <input
          type="text"
          placeholder="Jouw naam (optioneel)"
          value={joinName}
          onChange={(e) => onJoinName(e.target.value)}
        />
        <input
          type="text"
          placeholder="Spelcode (bijv. ATOM42)"
          value={joinCode}
          onChange={(e) => onJoinCode(e.target.value.toUpperCase())}
          style={{
            textTransform: "uppercase",
            letterSpacing: 2,
            fontFamily: "Orbitron, monospace",
            fontSize: 16,
          }}
        />
        <button
          className="btn bb"
          style={{ width: "100%", marginTop: 4 }}
          onClick={onJoin}
          disabled={!connected}
        >
          ▶ MEEDOEN
        </button>
        {joinErr && (
          <div
            style={{
              color: "var(--r)",
              fontSize: 12,
              marginTop: 6,
              textAlign: "center",
            }}
          >
            {joinErr}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── WAITING ROOM (HOST) ── */
function WaitingRoom({
  code,
  players,
  onStart,
}: {
  code: string;
  players: { name: string; points: number }[];
  onStart: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}?code=${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const joinUrl = `${window.location.origin}${window.location.pathname}?code=${code}`;

  return (
    <div className="card screen-enter" style={{ textAlign: "center" }}>
      <h2>☢ SPELCODE — DEEL DIT MET IEDEREEN</h2>
      <div className="code-display">{code}</div>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          margin: "12px 0",
          padding: 10,
          background: "#fff",
          borderRadius: 10,
          width: "fit-content",
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        <QRCodeSVG
          value={joinUrl}
          size={160}
          bgColor="#ffffff"
          fgColor="#0a0f0a"
        />
      </div>
      <div className="code-hint" style={{ marginBottom: 8 }}>
        Scan de QR-code of deel de link
      </div>
      <button
        className="btn bb"
        style={{ width: "100%", marginBottom: 10 }}
        onClick={copyLink}
      >
        {copied ? "✓ GEKOPIEERD!" : "⎘ KOPIEER LINK"}
      </button>
      <div style={{ marginBottom: 12 }}>
        {players.map((p) => (
          <div
            key={p.name}
            style={{ fontSize: 12, color: "var(--dim)", padding: "3px 0" }}
          >
            <span className="status-dot" />
            {p.name}
          </div>
        ))}
      </div>
      <button className="btn bg" style={{ width: "100%" }} onClick={onStart}>
        ▶ SPEL BEGINNEN
      </button>
      <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 8 }}>
        Wacht tot iedereen is ingelogd, druk dan op starten
      </div>
    </div>
  );
}

/* ── VIEWER WAIT ── */
function ViewerWait({
  code,
  players,
}: {
  code: string;
  players: { name: string }[];
}) {
  return (
    <div className="card screen-enter" style={{ textAlign: "center" }}>
      <h2>☢ VERBONDEN</h2>
      <div className="code-display">{code}</div>
      <div className="code-hint">Wachten tot de host het spel start...</div>
      <div>
        {players.map((p) => (
          <div
            key={p.name}
            style={{ fontSize: 12, color: "var(--dim)", padding: "3px 0" }}
          >
            <span className="status-dot" />
            {p.name}
          </div>
        ))}
      </div>
      <div className="viewer-msg pulse">⏳ Host start het spel zo...</div>
    </div>
  );
}

/* ── GAME SCREEN ── */
function GameScreen({
  state,
  isHost,
  mySocketId,
  myName,
  code,
  socket,
  onEnd,
}: {
  state: GameState;
  isHost: boolean;
  mySocketId: string | null;
  myName: string;
  code: string;
  socket: ReturnType<typeof useSocket>;
  onEnd: () => void;
}) {
  const myIdx = state.players.findIndex((p) => p.name === myName);
  const isMyTurn =
    mySocketId !== null && state.playerSocketIds[state.curP] === mySocketId;
  const curPlayerName = state.players[state.curP].name;

  const prevPointsRef = useRef<number[]>(state.players.map((p) => p.points));
  const [flashIdx, setFlashIdx] = useState<{
    i: number;
    dir: "pos" | "neg";
  } | null>(null);

  useEffect(() => {
    const prev = prevPointsRef.current;
    state.players.forEach((p, i) => {
      if (p.points !== prev[i]) {
        setFlashIdx({ i, dir: p.points > prev[i] ? "pos" : "neg" });
        setTimeout(() => setFlashIdx(null), 500);
      }
    });
    prevPointsRef.current = state.players.map((p) => p.points);
  }, [state.players]);

  return (
    <div className="game-wrap">
      <div className="topbar">
        <span className="ri">RONDE {state.round}</span>
        <span className="cp">
          {isMyTurn
            ? "✦ JOUW BEURT"
            : `${curPlayerName.toUpperCase()} AAN DE BEURT`}
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="status-dot" />
          {isHost && (
            <button className="btn br bsm" onClick={onEnd}>
              ⏹
            </button>
          )}
        </div>
      </div>

      <div className="sbar">
        {state.players.map((p, i) => (
          <div
            key={p.name}
            className={`chip${i === state.curP ? " active-turn" : ""}${i === myIdx ? " me" : ""}`}
          >
            <span className="pn">
              {p.name}
              {i === myIdx ? " (jij)" : ""}
            </span>
            <span
              className={`pt${p.points < 0 ? " neg" : ""}${flashIdx?.i === i ? (flashIdx.dir === "pos" ? " flash-pos" : " flash-neg") : ""}`}
            >
              {p.points > 0 ? "+" : ""}
              {p.points}
            </span>
          </div>
        ))}
      </div>

      <div className="czone">
        <div className="darea">
          <DeckCard
            type="vraag"
            icon="❓"
            label="VRAAG"
            color="var(--b)"
            count={state.decks.vraag.length}
            canDraw={isMyTurn && !state.inPlay && state.decks.vraag.length > 0}
            onDraw={() => socket.hostDraw(code, "vraag")}
          />
          <DeckCard
            type="risico"
            icon="⚠"
            label="RISICO"
            color="var(--r)"
            count={state.decks.risico.length}
            canDraw={isMyTurn && !state.inPlay && state.decks.risico.length > 0}
            onDraw={() => socket.hostDraw(code, "risico")}
          />
          <DeckCard
            type="kennis"
            icon="☢"
            label="KENNIS"
            color="var(--y)"
            count={state.decks.kennis.length}
            canDraw={isMyTurn && !state.inPlay && state.decks.kennis.length > 0}
            onDraw={() => socket.hostDraw(code, "kennis")}
          />
          {state.playerCorrectAnswers[state.curP] >=
          (state.bonusCardsDrawn[state.curP] + 1) * 5 ? (
            <DeckCard
              type="bonus"
              icon="⭐"
              label="BONUS"
              color="var(--g)"
              count={state.decks.bonus.length}
              canDraw={
                isMyTurn && !state.inPlay && state.decks.bonus.length > 0
              }
              onDraw={() => socket.hostDraw(code, "bonus")}
            />
          ) : (
            <LockedBonusDeck
              correct={state.playerCorrectAnswers[state.curP]}
              target={(state.bonusCardsDrawn[state.curP] + 1) * 5}
            />
          )}
        </div>

        <div className="acwrap">
          {state.activeCard !== null && state.cardType && (
            <ActiveCard
              key={`${state.cardType}-${state.activeCard}`}
              state={state}
              isHost={isMyTurn}
              code={code}
              socket={socket}
            />
          )}
        </div>

        {!isMyTurn && !state.inPlay && (
          <div className="viewer-msg">
            Wacht — {curPlayerName} trekt een kaart...
          </div>
        )}
        {!isMyTurn && state.inPlay && (
          <div className="viewer-msg">{curPlayerName} is aan het spelen...</div>
        )}
      </div>

      {state.turnTimeLeft > 0 && (
        <div
          className={`big-timer${state.turnTimeLeft <= 5 ? " timer-urgent" : state.turnTimeLeft <= 10 ? " timer-warn" : ""}`}
          style={
            {
              "--pct": `${(state.turnTimeLeft / 30) * 100}%`,
            } as React.CSSProperties
          }
        >
          <div className="big-timer-label">TIJD</div>
          <div className="big-timer-num">{state.turnTimeLeft}</div>
        </div>
      )}
    </div>
  );
}

function DeckCard({
  type,
  icon,
  label,
  color,
  count,
  canDraw,
  onDraw,
}: {
  type: CardType;
  icon: string;
  label: string;
  color: string;
  count: number;
  canDraw: boolean;
  onDraw: () => void;
}) {
  const cls = `dcard d${type[0]}${canDraw ? " clickable" : ""}`;
  return (
    <div className="dstack">
      <div
        className={cls}
        style={{ opacity: count === 0 ? 0.3 : 1 }}
        onClick={canDraw ? onDraw : undefined}
      >
        <span className="dico">{icon}</span>
        <span style={{ fontSize: 7, color, fontFamily: "Orbitron, monospace" }}>
          {label}
        </span>
        <span className="dcnt" style={{ color }}>
          {count}
        </span>
      </div>
      <div className="dlbl" style={{ color }}>
        {label}
      </div>
    </div>
  );
}

function LockedBonusDeck({
  correct,
  target,
}: {
  correct: number;
  target: number;
}) {
  const progress = correct % 5;
  return (
    <div className="dstack">
      <div className="dcard" style={{ opacity: 0.45, cursor: "not-allowed" }}>
        <span className="dico">🔒</span>
        <span
          style={{
            fontSize: 7,
            color: "var(--g)",
            fontFamily: "Orbitron, monospace",
          }}
        >
          BONUS
        </span>
        <span className="dcnt" style={{ color: "var(--dim)", fontSize: 8 }}>
          {progress}/5
        </span>
      </div>
      <div className="dlbl" style={{ color: "var(--dim)", fontSize: 8 }}>
        BONUS
      </div>
    </div>
  );
}

function ActiveCard({
  state,
  isHost,
  code,
  socket,
}: {
  state: GameState;
  isHost: boolean;
  code: string;
  socket: ReturnType<typeof useSocket>;
}) {
  const t = state.cardType!;
  const idx = state.activeCard!;

  if (t === "vraag") {
    const card = CARDS.vraag[idx];
    const answered = state.chosenAnswer !== null;

    // Gebruik de door de server geshuffelde volgorde
    const shuffledOpts = state.shuffledOpts
      ? state.shuffledOpts.map((origIdx) => card.opts[origIdx])
      : card.opts;

    const correctShuffledIdx = state.shuffledOpts
      ? state.shuffledOpts.indexOf(card.ans)
      : card.ans;

    return (
      <div className="ac vraag">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span className="badge vraag">❓ VRAAGKAART</span>
          <span
            style={{
              color: "var(--g)",
              fontFamily: "Orbitron, monospace",
              fontSize: 9,
            }}
          >
            +{card.pts} pt
          </span>
        </div>
        <div className="cq">{card.q}</div>
        <div className="aopts">
          {shuffledOpts.map((o, i) => {
            let cls = "abtn";
            if (answered) {
              if (i === correctShuffledIdx) cls += " correct";
              else if (i === state.chosenAnswer && i !== correctShuffledIdx)
                cls += " wrong";
            }
            return (
              <button
                key={i}
                className={cls}
                disabled={answered || !isHost}
                onClick={() => socket.hostAnswer(code, i)}
              >
                {String.fromCharCode(65 + i)}. {o}
              </button>
            );
          })}
        </div>
        {answered && (
          <div
            className={`fb ${state.chosenAnswer === correctShuffledIdx ? "ok" : "fail"}`}
          >
            {state.chosenAnswer === correctShuffledIdx
              ? `✓ GOED! +${card.pts} punten!`
              : `✗ FOUT! -1 punt. Goed: ${String.fromCharCode(65 + correctShuffledIdx)}`}
          </div>
        )}
        {answered && isHost && (
          <div className="nbw">
            <button
              className="btn bg bsm"
              onClick={() => socket.hostNext(code)}
            >
              VOLGENDE ▸
            </button>
          </div>
        )}
        {!isHost && answered && (
          <div className="viewer-msg">Host klikt op volgende...</div>
        )}
      </div>
    );
  }

  if (t === "bonus") {
    const card = CARDS.bonus[idx];
    const done = state.pendingAction === "done";
    return (
      <div className="ac bonus">
        <span className="badge bonus">⭐ BONUSKAART</span>
        <div className="cq" style={{ color: "var(--g)" }}>
          {card.title}
        </div>
        <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.5 }}>
          {card.desc}
        </div>
        {isHost && !done && (
          <div className="nbw">
            <button
              className="btn bg bsm"
              onClick={() => socket.hostApplyBonus(code)}
            >
              ACTIVEER ▸
            </button>
          </div>
        )}
        {!isHost && (
          <div className="viewer-msg">
            {state.players[state.curP].name} activeert een bonuskaart...
          </div>
        )}
      </div>
    );
  }

  if (t === "straf") {
    const card = CARDS.straf[idx];
    return (
      <div className="ac straf">
        <span className="badge straf">☠ STRAFKAART</span>
        <div className="cq" style={{ color: "var(--r)" }}>
          {card.title}
        </div>
        <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.5 }}>
          {card.desc}
        </div>
        {card.skipTurn && (
          <div
            style={{
              fontSize: 11,
              color: "var(--r)",
              fontFamily: "Orbitron, monospace",
              marginTop: 4,
            }}
          >
            ⏭ VOLGENDE BEURT OVERGESLAGEN
          </div>
        )}
        {isHost && (
          <div className="nbw">
            <button
              className="btn br bsm"
              onClick={() => socket.hostApplyStraf(code)}
            >
              BEGREPEN ▸
            </button>
          </div>
        )}
        {!isHost && (
          <div className="viewer-msg">
            {state.players[state.curP].name} ontvangt een straf...
          </div>
        )}
      </div>
    );
  }

  if (t === "risico") {
    const card = CARDS.risico[idx];
    const answered = state.chosenAnswer !== null;
    return (
      <div className="ac risico">
        <span className="badge risico">⚠ RISICOKAART</span>
        <div className="cq">{card.sit}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {card.c.map((ch, i) => (
            <button
              key={i}
              className="rchoice"
              disabled={answered || !isHost}
              onClick={() => socket.hostChooseR(code, i)}
            >
              {ch}
            </button>
          ))}
        </div>
        {answered && (
          <div className={`fb ${state.risicoResult === "ok" ? "ok" : "fail"}`}>
            {state.risicoMsg}
          </div>
        )}
        {answered && (
          <div className="viewer-msg" style={{ marginTop: 6 }}>
            Kaart wordt getrokken...
          </div>
        )}
      </div>
    );
  }

  if (t === "kennis") {
    const card = CARDS.kennis[idx];
    const bonusMap: Record<string, string> = {
      extravraag: "Trek een gratis vraagkaart!",
      pt1: "Pak 1 punt extra.",
      pt2: "Pak 2 punten extra.",
    };
    return (
      <div className="ac kennis">
        <span className="badge kennis">☢ KENNISKAART</span>
        <div className="cq" style={{ color: "var(--y)" }}>
          Weetje uit §6
        </div>
        <div className="ktxt">{card.fact}</div>
        <div style={{ fontSize: 11, color: "var(--y)", marginTop: 2 }}>
          🎁 {bonusMap[card.bonus] || card.bonus}
        </div>
        {isHost && (
          <div className="nbw">
            <button
              className="btn by bsm"
              onClick={() => socket.hostApplyKennis(code)}
            >
              BEGREPEN ▸
            </button>
          </div>
        )}
        {!isHost && (
          <div className="viewer-msg">Host leest de kenniskaart...</div>
        )}
      </div>
    );
  }

  return null;
}

/* ── WINNER ── */
function WinnerScreen({
  state,
  onHome,
}: {
  state: GameState;
  onHome: () => void;
}) {
  const sorted = [...state.players].sort((a, b) => b.points - a.points);
  const medals = ["🥇", "🥈", "🥉", "4.", "5."];
  return (
    <div
      className="screen-enter"
      style={{ textAlign: "center", padding: "24px 12px" }}
    >
      <div className="wtitle">☢ GAME OVER ☢</div>
      <span className="winner-trophy">🏆</span>
      <div
        style={{
          fontSize: 10,
          color: "var(--dim)",
          marginBottom: 4,
          fontFamily: "Orbitron, monospace",
          letterSpacing: 2,
        }}
      >
        WINNAAR
      </div>
      <div className="wname">{sorted[0].name.toUpperCase()}</div>
      <div className="fscores">
        {sorted.map((p, i) => (
          <div key={p.name} className={`frow${i === 0 ? " first" : ""}`}>
            <span className="fn">
              {medals[i]} {p.name}
            </span>
            <span className="fp">
              {p.points > 0 ? "+" : ""}
              {p.points}
            </span>
          </div>
        ))}
      </div>
      <button
        className="btn bg"
        style={{ fontSize: 11, padding: "10px 24px" }}
        onClick={onHome}
      >
        ↩ NIEUW SPEL
      </button>
    </div>
  );
}

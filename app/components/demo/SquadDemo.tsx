"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SQUAD_COLORS, SQUAD_ACCENT, SQUAD_BG } from "../../lib/squad-game";

const RED = SQUAD_ACCENT;
const TRACK_LENGTH = 100;
const BOT_NAMES = ["Viper_01", "xXslayer", "degen.eth", "0xghost", "moonbag", "rekt_ronin", "satoshi_jr", "ape_strong", "hogfather", "ngmi_nate", "diamond_d"];

interface Racer {
  name: string;
  pos: number;
  alive: boolean;
  isYou: boolean;
  speed: number;      // units/sec during green
  reaction: number;   // ms to stop after red (bots only)
}

const freshRoster = (): Racer[] => [
  { name: "YOU", pos: 0, alive: true, isYou: true, speed: 14, reaction: 0 },
  ...BOT_NAMES.map((n) => ({
    name: n,
    pos: 0,
    alive: true,
    isYou: false,
    speed: 8 + Math.random() * 8,       // 8-16 u/s
    reaction: 200 + Math.random() * 800, // 200-1000ms to freeze
  })),
];

type Phase = "idle" | "green" | "red" | "over";

/** Solo demo: REAL red-light/green-light. Hold to move during green, freeze on red. */
export function SquadDemo() {
  const [roster, setRoster] = useState<Racer[]>(freshRoster);
  const [phase, setPhase] = useState<Phase>("idle");
  const [won, setWon] = useState<boolean | null>(null);
  const [moving, setMoving] = useState(false);
  const [toasts, setToasts] = useState<{ key: number; text: string }[]>([]);
  const stateRef = useRef({ roster, phase, won, moving });
  stateRef.current = { roster, phase, won, moving };
  const toastKey = useRef(0);
  const gameToken = useRef(0);
  const rafRef = useRef(0);
  const lastTs = useRef(0);

  const pushToast = useCallback((text: string) => {
    toastKey.current += 1;
    const key = toastKey.current;
    setToasts((t) => [...t.slice(-3), { key, text }]);
  }, []);

  const endGame = useCallback((playerWon: boolean, reason: string) => {
    gameToken.current += 1;
    cancelAnimationFrame(rafRef.current);
    setWon(playerWon);
    setPhase("over");
    setMoving(false);
    pushToast(reason);
  }, [pushToast]);

  const switchLight = useCallback(() => {
    const tk = gameToken.current;
    const s = stateRef.current;
    if (s.phase === "over") return;

    if (s.phase === "green") {
      // → RED LIGHT. Caught moving? You're out.
      setPhase("red");
      const youMoving = stateRef.current.moving;
      const you = stateRef.current.roster.find((r) => r.isYou)!;

      setRoster((rs) => {
        // Bots: slow reactors get caught.
        const caught = new Set<string>();
        rs.forEach((r) => {
          if (!r.alive || r.isYou) return;
          // Bot was "moving" (all bots move during green); reaction roll.
          if (Math.random() * 1000 > r.reaction + 400) {
            // fast enough — survives
          } else if (r.reaction > 650 && Math.random() < 0.35) {
            caught.add(r.name);
          }
        });
        if (you.alive && youMoving) caught.add("YOU");
        return rs.map((r) => (caught.has(r.name) ? { ...r, alive: false } : r));
      });

      if (you.alive && youMoving) {
        setTimeout(() => {
          if (gameToken.current !== tk) return;
          pushToast("🔴 CAUGHT MOVING — YOU'RE OUT");
        }, 300);
      }

      // Check win/lose after red resolves.
      setTimeout(() => {
        if (gameToken.current !== tk) return;
        const cur = stateRef.current;
        const youAlive = cur.roster.find((r) => r.isYou)!.alive;
        const botsAlive = cur.roster.filter((r) => !r.isYou && r.alive);
        const youFinished = cur.roster.find((r) => r.isYou)!.pos >= TRACK_LENGTH;

        if (!youAlive) {
          endGame(false, "💀 ELIMINATED — you moved on red");
        } else if (youFinished) {
          endGame(true, "🏁 YOU CROSSED THE FINISH!");
        } else if (botsAlive.length === 0) {
          endGame(true, "👑 LAST ONE STANDING!");
        } else {
          // Back to green after a tense pause.
          const redMs = 1200 + Math.random() * 1800;
          setTimeout(() => {
            if (gameToken.current !== tk) return;
            setPhase("green");
            pushToast("🟢 GREEN LIGHT — GO!");
            scheduleSwitch();
          }, redMs);
        }
      }, 800);
    }
  }, [endGame, pushToast]);

  const scheduleSwitch = useCallback(() => {
    const tk = gameToken.current;
    // Green lasts 1.5–4s (unpredictable).
    const greenMs = 1500 + Math.random() * 2500;
    setTimeout(() => {
      if (gameToken.current !== tk) return;
      if (stateRef.current.phase === "green") switchLight();
    }, greenMs);
  }, [switchLight]);

  // Game loop: move racers during green.
  const loop = useCallback((ts: number) => {
    const tk = gameToken.current;
    const dt = Math.min(0.05, (ts - lastTs.current) / 1000 || 0.016);
    lastTs.current = ts;
    const s = stateRef.current;

    if (s.phase === "green") {
      setRoster((rs) => {
        let changed = false;
        const next = rs.map((r) => {
          if (!r.alive || r.pos >= TRACK_LENGTH) return r;
          // You move only while holding. Bots always move during green.
          const isMoving = r.isYou ? s.moving : true;
          if (!isMoving) return r;
          changed = true;
          return { ...r, pos: Math.min(TRACK_LENGTH, r.pos + r.speed * dt) };
        });
        return changed ? next : rs;
      });

      // Check if you finished.
      const you = stateRef.current.roster.find((r) => r.isYou)!;
      if (you.alive && you.pos >= TRACK_LENGTH) {
        endGame(true, "🏁 YOU CROSSED THE FINISH!");
        return;
      }
      // Check if any bot finished (they keep going).
      const botFinished = stateRef.current.roster.some((r) => !r.isYou && r.alive && r.pos >= TRACK_LENGTH);
      if (botFinished) {
        // Bots finishing doesn't end it for you — keep going until you finish or die.
      }
    }

    if (stateRef.current.phase !== "over") {
      rafRef.current = requestAnimationFrame(loop);
    }
  }, [endGame]);

  const start = useCallback(() => {
    gameToken.current += 1;
    const tk = gameToken.current;
    const r = freshRoster();
    setRoster(r);
    setToasts([]);
    setWon(null);
    setMoving(false);
    setPhase("green");
    pushToast("🟢 GREEN LIGHT — HOLD TO MOVE!");
    lastTs.current = 0;
    rafRef.current = requestAnimationFrame((ts) => {
      lastTs.current = ts;
      loop(ts);
    });
    // Schedule first red light.
    const greenMs = 2000 + Math.random() * 2000;
    setTimeout(() => {
      if (gameToken.current !== tk) return;
      if (stateRef.current.phase === "green") switchLight();
    }, greenMs);
  }, [loop, switchLight, pushToast]);

  // Hold SPACE or press-and-hold button to move.
  const setHold = useCallback((hold: boolean) => {
    const s = stateRef.current;
    if (s.phase !== "green") {
      setMoving(false);
      return;
    }
    const you = s.roster.find((r) => r.isYou)!;
    if (!you.alive) {
      setMoving(false);
      return;
    }
    setMoving(hold);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setHold(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setHold(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [setHold]);

  useEffect(() => () => {
    gameToken.current += 1;
    cancelAnimationFrame(rafRef.current);
  }, []);

  const you = roster.find((r) => r.isYou)!;
  const aliveCount = roster.filter((r) => r.alive).length;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border-2 px-4 py-3"
        style={{ borderColor: "#3f1d24", background: SQUAD_BG }}>
        <span className="font-pixel text-[10px]" style={{ color: RED }}>🎮 SOLO DEMO</span>
        {phase === "green" && <span className="font-pixel animate-pulse text-[10px] text-green-400">🟢 GREEN LIGHT</span>}
        {phase === "red" && <span className="font-pixel animate-pulse text-[10px]" style={{ color: RED }}>🔴 RED LIGHT — FREEZE!</span>}
        <span className="font-pixel text-[10px]" style={{ color: RED }}>{aliveCount} ALIVE</span>
        <span className="ml-auto text-xs font-bold text-zinc-500">no wallet · no stakes</span>
      </div>

      {toasts.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {toasts.map((t) => (
            <div key={t.key} className="rounded-xl border border-[#3f1d24] bg-[#16090c] px-4 py-2 text-xs font-bold text-zinc-300">
              {t.text}
            </div>
          ))}
        </div>
      )}

      {phase === "idle" && (
        <div className="rounded-3xl border-2 p-8 text-center" style={{ borderColor: "#3f1d24", background: SQUAD_BG }}>
          <div className="text-4xl">🦑</div>
          <div className="font-pixel mt-3 text-sm leading-relaxed text-zinc-100">RED LIGHT, GREEN LIGHT</div>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
            🟢 <span className="font-bold text-zinc-100">HOLD</span> SPACE or the button to run.
            🔴 When it turns red, <span className="font-bold text-zinc-100">LET GO</span> —
            caught moving and you're out. First to the finish wins.
          </p>
          <button
            onClick={start}
            className="font-pixel mt-6 rounded-2xl px-8 py-4 text-sm text-black transition active:scale-[0.98]"
            style={{ background: RED }}
          >
            ▶ START DEMO
          </button>
        </div>
      )}

      {(phase === "green" || phase === "red") && (
        <>
          {/* Track */}
          <div className="mb-5 rounded-3xl border-2 p-4" style={{ borderColor: "#3f1d24", background: SQUAD_BG }}>
            <div className="relative h-64">
              {/* Finish line */}
              <div className="absolute top-0 bottom-0 right-2 w-1" style={{ background: "#fbbf24" }} />
              <div className="absolute top-1 right-4 font-pixel text-[9px] text-yellow-400">FINISH</div>
              {/* Start line */}
              <div className="absolute top-0 bottom-0 left-2 w-1 bg-zinc-700" />
              {/* Racers */}
              {roster.map((r, i) => {
                if (!r.alive && r.pos === 0) return null;
                const leftPct = 4 + (r.pos / TRACK_LENGTH) * 90;
                const topPct = 6 + (i % 12) * 7.5;
                return (
                  <div
                    key={r.name}
                    className="absolute flex items-center gap-1 transition-all duration-100"
                    style={{ left: `${leftPct}%`, top: `${topPct}%`, opacity: r.alive ? 1 : 0.3 }}
                  >
                    <span
                      className="inline-block h-3 w-3 rounded-full border"
                      style={{
                        background: SQUAD_COLORS[i % SQUAD_COLORS.length],
                        borderColor: r.isYou ? "#fff" : "transparent",
                        borderWidth: r.isYou ? 2 : 0,
                      }}
                    />
                    <span className={`font-pixel text-[8px] ${r.isYou ? "text-white" : "text-zinc-400"}`}>
                      {r.isYou ? "YOU" : r.name.slice(0, 8)}
                      {!r.alive && " 💀"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Hold button */}
          {you.alive && phase === "green" && (
            <button
              onPointerDown={(e) => { e.preventDefault(); setHold(true); }}
              onPointerUp={() => setHold(false)}
              onPointerLeave={() => setHold(false)}
              onContextMenu={(e) => e.preventDefault()}
              className={`font-pixel mb-5 w-full rounded-3xl py-8 text-base text-black transition select-none touch-none ${moving ? "scale-[0.98]" : ""}`}
              style={{
                background: moving ? "#22c55e" : RED,
                boxShadow: moving ? `0 0 60px #22c55e88` : `0 0 40px ${RED}55`,
              }}
            >
              {moving ? "🏃 RUNNING… LET GO ON RED!" : "👆 HOLD TO RUN"}
            </button>
          )}
          {you.alive && phase === "red" && (
            <div className="font-pixel mb-5 w-full rounded-3xl border-2 border-red-900 bg-[#1a0808] py-6 text-center text-sm animate-pulse" style={{ color: RED }}>
              🔴 FROZEN — DON'T TOUCH ANYTHING
            </div>
          )}
          {!you.alive && (
            <div className="font-pixel mb-5 w-full rounded-3xl border-2 border-zinc-800 bg-[#0d0d12] py-6 text-center text-sm text-zinc-500">
              💀 YOU'RE OUT — WATCH THE BOTS
            </div>
          )}
        </>
      )}

      {phase === "over" && (
        <div className="mb-5 rounded-3xl border-2 p-8 text-center" style={{ borderColor: "#3f1d24", background: SQUAD_BG }}>
          <div className="font-pixel text-lg leading-relaxed" style={{ color: RED }}>
            {won ? "🏆 YOU SURVIVED!" : "💀 ELIMINATED"}
          </div>
          <p className="mt-3 text-sm text-zinc-400">
            {won ? "First across the line. The real game pays the pot — this was practice." : "Caught moving on red. The doll has no mercy. Run it back!"}
          </p>
          <button
            onClick={start}
            className="font-pixel mt-6 rounded-2xl px-8 py-4 text-sm text-black transition active:scale-[0.98]"
            style={{ background: RED }}
          >
            PLAY AGAIN →
          </button>
        </div>
      )}

      {(phase === "green" || phase === "red") && (
        <p className="mt-4 text-center text-xs font-bold text-zinc-500">
          Hold <span className="font-pixel text-[10px] text-zinc-300">SPACE</span> or press-and-hold the button · release before red
        </p>
      )}
    </div>
  );
}

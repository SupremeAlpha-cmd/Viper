"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const RED = "#ef4444";
const GREEN = "#22c55e";
const NAVY = "#0b1230";
const FINISH_M = 100;
const SPEED = 12; // meters per second while holding

type Phase = "idle" | "green" | "red" | "dead" | "finished";

const BEST_KEY = "squad-best-m";

/** Solo demo: Red Light Green Light. Hold to run, release on red. Reach 100m. */
export function SquadDemo() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [holding, setHolding] = useState(false);
  const [dist, setDist] = useState(0);
  const [best, setBest] = useState(0);
  const [time, setTime] = useState(0);
  const stateRef = useRef({ phase, holding, dist, time });
  stateRef.current = { phase, holding, dist, time };
  const token = useRef(0);
  const raf = useRef(0);
  const lastTs = useRef(0);

  useEffect(() => {
    try {
      setBest(Number(localStorage.getItem(BEST_KEY) || 0));
    } catch { /* ignore */ }
  }, []);

  const saveBest = useCallback((d: number) => {
    setBest((b) => {
      if (d > b) {
        try { localStorage.setItem(BEST_KEY, String(Math.floor(d))); } catch { /* ignore */ }
        return Math.floor(d);
      }
      return b;
    });
  }, []);

  const goRed = useCallback(() => {
    const tk = token.current;
    const s = stateRef.current;
    if (s.phase !== "green") return;
    setPhase("red");
    // Caught holding?
    if (s.holding) {
      setTimeout(() => {
        if (token.current !== tk) return;
        setPhase("dead");
        saveBest(stateRef.current.dist);
        cancelAnimationFrame(raf.current);
      }, 250);
      return;
    }
    // Survived — schedule next green (random 0.8–2.8s).
    const redMs = 800 + Math.random() * 2000;
    setTimeout(() => {
      if (token.current !== tk) return;
      if (stateRef.current.phase !== "red") return;
      setPhase("green");
      scheduleRed();
    }, redMs);
  }, [saveBest]);

  const scheduleRed = useCallback(() => {
    const tk = token.current;
    // Green lasts 1.2–4.5s. No countdown. Sudden.
    const greenMs = 1200 + Math.random() * 3300;
    setTimeout(() => {
      if (token.current !== tk) return;
      goRed();
    }, greenMs);
  }, [goRed]);

  const loop = useCallback((ts: number) => {
    const dt = Math.min(0.05, (ts - lastTs.current) / 1000 || 0.016);
    lastTs.current = ts;
    const s = stateRef.current;

    if (s.phase === "green" && s.holding) {
      const nd = s.dist + SPEED * dt;
      const nt = s.time + dt;
      setDist(nd);
      setTime(nt);
      if (nd >= FINISH_M) {
        token.current += 1;
        cancelAnimationFrame(raf.current);
        setPhase("finished");
        saveBest(FINISH_M);
        return;
      }
    } else if (s.phase === "green") {
      setTime((t) => t + dt);
    }

    if (stateRef.current.phase === "green" || stateRef.current.phase === "red") {
      raf.current = requestAnimationFrame(loop);
    }
  }, [saveBest]);

  const start = useCallback(() => {
    token.current += 1;
    setDist(0);
    setTime(0);
    setHolding(false);
    setPhase("green");
    lastTs.current = 0;
    raf.current = requestAnimationFrame((ts) => {
      lastTs.current = ts;
      loop(ts);
    });
    scheduleRed();
  }, [loop, scheduleRed]);

  const setHold = useCallback((h: boolean) => {
    const s = stateRef.current;
    if (s.phase !== "green" && s.phase !== "red") return;
    // Pressing during red = instant death (you moved).
    if (h && s.phase === "red") {
      token.current += 1;
      cancelAnimationFrame(raf.current);
      setPhase("dead");
      saveBest(s.dist);
      setHolding(false);
      return;
    }
    setHolding(h);
  }, [saveBest]);

  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) { e.preventDefault(); setHold(true); }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); setHold(false); }
    };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", dn);
      window.removeEventListener("keyup", up);
    };
  }, [setHold]);

  useEffect(() => () => {
    token.current += 1;
    cancelAnimationFrame(raf.current);
  }, []);

  const pct = Math.min(100, (dist / FINISH_M) * 100);
  const isGreen = phase === "green";
  const isRed = phase === "red";

  return (
    <div
      className="min-h-[80vh] rounded-3xl border-[3px] transition-colors duration-200 select-none"
      style={{
        borderColor: NAVY,
        background: phase === "green" ? "#052e16" : phase === "red" ? "#450a0a" : "#0b1230",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5">
        <span className="font-pixel text-[10px] tracking-widest text-white/70">RED LIGHT · GREEN LIGHT</span>
        <span className="font-pixel text-[10px] text-white/70">BEST: {best}m</span>
      </div>

      {phase === "idle" && (
        <div className="px-6 py-16 text-center">
          <div className="font-pixel text-3xl text-white">🔴 RED LIGHT</div>
          <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-white/70">
            Hold the button when the light is green. Release the instant it turns red.
            Reach <span className="font-bold text-white">100m</span> to win.
          </p>
          <button
            onClick={start}
            className="font-pixel mt-8 rounded-2xl bg-white px-10 py-4 text-sm transition active:scale-95"
            style={{ color: NAVY }}
          >
            ▶ START GAME
          </button>
        </div>
      )}

      {(isGreen || isRed) && (
        <div className="px-6 py-8 text-center">
          {/* Giant status */}
          <div className="font-pixel text-5xl">
            {isGreen ? <span className="text-green-400">🟢</span> : <span className="text-red-500">🔴</span>}
          </div>
          <div className={`font-pixel mt-3 text-2xl ${isGreen ? "text-green-300" : "text-red-400"}`}>
            {isGreen ? "GREEN LIGHT" : "RED LIGHT"}
          </div>
          <div className="font-pixel mt-2 text-sm text-white/60">
            {Math.floor(dist)}m / {FINISH_M}m · {time.toFixed(1)}s
          </div>

          {/* Progress track */}
          <div className="relative mx-auto mt-8 h-4 max-w-md overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-all duration-100"
              style={{ width: `${pct}%`, background: isGreen ? GREEN : "#71717a" }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between max-w-md mx-auto">
            <span className="font-pixel text-[9px] text-white/50">START</span>
            {/* Runner */}
            <span
              className="text-2xl transition-all duration-100"
              style={{ marginRight: `${100 - pct}%` }}
            >
              {holding && isGreen ? "🏃" : "🧍"}
            </span>
            <span className="font-pixel text-[9px] text-white/50">🏁 FINISH</span>
          </div>

          {/* THE button */}
          <button
            onPointerDown={(e) => { e.preventDefault(); setHold(true); }}
            onPointerUp={() => setHold(false)}
            onPointerLeave={() => setHold(false)}
            onPointerCancel={() => setHold(false)}
            onContextMenu={(e) => e.preventDefault()}
            className="font-pixel mt-10 w-full max-w-md rounded-3xl py-10 text-xl text-black transition active:scale-[0.98] touch-none"
            style={{
              background: isGreen ? (holding ? GREEN : "#bbf7d0") : RED,
              boxShadow: isGreen ? `0 0 80px ${GREEN}66` : `0 0 80px ${RED}66`,
              color: isGreen && !holding ? "#052e16" : "#000",
            }}
          >
            {isGreen ? (holding ? "🏃 RUNNING…" : "HOLD TO RUN") : "⚠️ RELEASE NOW"}
          </button>
          <p className="mt-4 text-xs font-bold text-white/40">
            Press-and-hold · or hold <span className="font-pixel text-[10px] text-white/60">SPACE</span>
          </p>
        </div>
      )}

      {phase === "dead" && (
        <div className="px-6 py-16 text-center">
          <div className="text-6xl">💀</div>
          <div className="font-pixel mt-4 text-2xl text-red-400">CAUGHT!</div>
          <p className="mt-3 text-sm text-white/60">You moved during red light.</p>
          <p className="font-pixel mt-2 text-xs text-white/50">{Math.floor(dist)}m · BEST {best}m</p>
          <button
            onClick={start}
            className="font-pixel mt-8 rounded-2xl bg-white px-10 py-4 text-sm transition active:scale-95"
            style={{ color: NAVY }}
          >
            ↻ TRY AGAIN
          </button>
        </div>
      )}

      {phase === "finished" && (
        <div className="px-6 py-16 text-center">
          <div className="text-6xl">🏁</div>
          <div className="font-pixel mt-4 text-2xl text-green-300">YOU MADE IT!</div>
          <p className="font-pixel mt-3 text-xs text-white/60">100m in {time.toFixed(1)}s</p>
          <button
            onClick={start}
            className="font-pixel mt-8 rounded-2xl bg-white px-10 py-4 text-sm transition active:scale-95"
            style={{ color: NAVY }}
          >
            ↻ PLAY AGAIN
          </button>
        </div>
      )}
    </div>
  );
}

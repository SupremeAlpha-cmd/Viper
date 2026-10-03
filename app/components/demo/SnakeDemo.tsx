"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SnakeGrid } from "../SnakeGrid";
import { SNAKE_GRID, SNAKE_COLORS, DIRS } from "../../lib/snake";
import type { SnakePlayer } from "../../lib/useSnake";
import { DemoNameInput } from "./DemoNameInput";
import { submitScore } from "../../lib/leaderboard";

const GREEN = "#22c55e";
const BG = "#0b1020";
const SELF = "0x00000000000000000000000000000000DEADBEEF" as `0x${string}`;
const TICK_MS = 160;

const pack = (x: number, y: number) => (x << 8) | y;
const rand = (n: number) => (Math.random() * n) | 0;

function freeCell(occupied: Set<number>): number {
  for (let i = 0; i < 200; i++) {
    const c = pack(rand(SNAKE_GRID), rand(SNAKE_GRID));
    if (!occupied.has(c)) return c;
  }
  return pack(rand(SNAKE_GRID), rand(SNAKE_GRID));
}

function DPadBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); onPress(); }}
      className="font-pixel flex h-14 w-14 items-center justify-center rounded-2xl border-2 bg-[#131a2e] text-base text-zinc-100 transition active:scale-95"
      style={{ borderColor: "#26314d" }}
    >
      {label}
    </button>
  );
}

/** Solo snake demo — no wallet, no chain. Eat coins, grow, don't die. */
export function SnakeDemo() {
  const [segs, setSegs] = useState<number[]>(() => [pack(12, 12), pack(11, 12), pack(10, 12)]);
  const [dir, setDir] = useState(1);
  const [foods, setFoods] = useState<number[]>(() => {
    const s = new Set([pack(12, 12), pack(11, 12), pack(10, 12)]);
    return [freeCell(s), freeCell(s), freeCell(s)];
  });
  const [score, setScore] = useState(0);
  const [alive, setAlive] = useState(true);
  const [started, setStarted] = useState(false);
  const [best, setBest] = useState(0);
  const stateRef = useRef({ segs, dir, foods, score, alive, started });
  stateRef.current = { segs, dir, foods, score, alive, started };
  const deathSubmitted = useRef(false);

  const restart = useCallback(() => {
    setSegs([pack(12, 12), pack(11, 12), pack(10, 12)]);
    setDir(1);
    const s = new Set([pack(12, 12), pack(11, 12), pack(10, 12)]);
    setFoods([freeCell(s), freeCell(s), freeCell(s)]);
    setScore(0);
    setAlive(true);
    setStarted(true);
    deathSubmitted.current = false;
  }, []);

  const steer = useCallback((d: number) => {
    const s = stateRef.current;
    if (!s.started || !s.alive) return;
    // No 180° turns.
    if ((d + 2) % 4 === s.dir) return;
    setDir(d);
  }, []);

  useEffect(() => {
    if (!started || !alive) return;
    const t = setInterval(() => {
      const s = stateRef.current;
      const head = s.segs[0];
      const hx = head >> 8, hy = head & 0xff;
      const { dx, dy } = DIRS[s.dir];
      const nx = hx + dx, ny = hy + dy;
      // Wall death.
      if (nx < 0 || ny < 0 || nx >= SNAKE_GRID || ny >= SNAKE_GRID) {
        setAlive(false);
        setBest((b) => Math.max(b, s.score));
        return;
      }
      const nc = pack(nx, ny);
      const ate = s.foods.includes(nc);
      // Self death (tail vacates unless growing).
      const body = ate ? s.segs : s.segs.slice(0, -1);
      if (body.includes(nc)) {
        setAlive(false);
        setBest((b) => Math.max(b, s.score));
        return;
      }
      const next = [nc, ...s.segs];
      if (ate) {
        const occupied = new Set(next);
        const remaining = s.foods.filter((f) => f !== nc);
        remaining.push(freeCell(occupied));
        setFoods(remaining);
        setScore((sc) => sc + 10);
      } else {
        next.pop();
      }
      setSegs(next);
    }, TICK_MS);
    return () => clearInterval(t);
  }, [started, alive]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const dirs: Record<string, number> = {
        arrowup: 0, w: 0,
        arrowright: 1, d: 1,
        arrowdown: 2, s: 2,
        arrowleft: 3, a: 3,
      };
      if (dirs[k] !== undefined) {
        e.preventDefault();
        steer(dirs[k]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steer]);

  const player: SnakePlayer = { address: SELF, segments: segs, dir, score, alive };

  // Submit final score to the daily leaderboard once per death.
  useEffect(() => {
    if (started && !alive && !deathSubmitted.current) {
      deathSubmitted.current = true;
      if (score > 0) submitScore("snake", score);
    }
  }, [started, alive, score]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <DemoNameInput variant="dark" />
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border-2 border-[#26314d] bg-[#0b1020] px-4 py-3">
        <span className="font-pixel text-[10px]" style={{ color: GREEN }}>🎮 SOLO DEMO</span>
        <span className="text-xs font-bold text-zinc-200">SCORE <span style={{ color: GREEN }}>{score}</span></span>
        {best > 0 && <span className="text-xs font-bold text-zinc-500">BEST {best}</span>}
        <span className="ml-auto text-xs font-bold text-zinc-500">no wallet · no stakes</span>
      </div>

      <div className="relative rounded-3xl border-2 border-[#26314d] bg-[#0b1020] p-3">
        <SnakeGrid players={[player]} coins={foods} deaths={[]} self={SELF} />
        {!started && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl" style={{ background: "rgba(4,8,16,0.75)" }}>
            <button
              onClick={restart}
              className="font-pixel rounded-2xl px-8 py-4 text-sm text-black transition active:scale-[0.98]"
              style={{ background: GREEN }}
            >
              ▶ START DEMO
            </button>
          </div>
        )}
        {started && !alive && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl p-4" style={{ background: "rgba(4,8,16,0.8)" }}>
            <div className="w-full max-w-sm rounded-3xl border-2 p-6 text-center" style={{ borderColor: GREEN, background: BG }}>
              <div className="font-pixel text-lg leading-relaxed" style={{ color: GREEN }}>💀 GAME OVER</div>
              <div className="mt-3 text-sm font-medium text-zinc-400">Score: <span className="font-bold text-zinc-100">{score}</span></div>
              <button
                onClick={restart}
                className="font-pixel mt-6 w-full rounded-2xl py-3.5 text-xs text-black transition active:scale-[0.98]"
                style={{ background: GREEN }}
              >
                PLAY AGAIN →
              </button>
            </div>
          </div>
        )}
      </div>

      {started && alive && (
        <>
          <div className="mt-8 flex items-center justify-center">
            <div className="grid grid-cols-3 gap-2">
              <div />
              <DPadBtn label="↑" onPress={() => steer(0)} />
              <div />
              <DPadBtn label="←" onPress={() => steer(3)} />
              <DPadBtn label="↓" onPress={() => steer(2)} />
              <DPadBtn label="→" onPress={() => steer(1)} />
            </div>
          </div>
          <p className="mt-4 text-center text-xs font-bold text-zinc-500">
            Arrows / WASD or D-pad · eat memecoins to grow · walls and your own body kill
          </p>
        </>
      )}
    </div>
  );
}

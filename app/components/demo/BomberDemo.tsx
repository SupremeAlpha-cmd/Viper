"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArenaGrid } from "../ArenaGrid";
import { GRID } from "../../lib/contract";
import type { PlayerState, BombState, Flash } from "../../lib/useViper";
import { Card, Cartridge, ChunkyButton, NAVY, BLUE, AMBER } from "../cartoon";

const TICK_MS = 700;
const FUSE = 3;
const BLAST = 2;

const SELF = "0x00000000000000000000000000000000DEADBEEF" as `0x${string}`;
const BOTS = [
  { addr: "0x000000000000000000000000000000000000b001" as `0x${string}`, name: "BOT-1", x: GRID - 1, y: GRID - 1 },
  { addr: "0x000000000000000000000000000000000000b002" as `0x${string}`, name: "BOT-2", x: GRID - 1, y: 0 },
  { addr: "0x000000000000000000000000000000000000b003" as `0x${string}`, name: "BOT-3", x: 0, y: GRID - 1 },
];

interface SimPlayer { addr: `0x${string}`; name: string; x: number; y: number; alive: boolean; isBot: boolean }
interface SimBomb { x: number; y: number; detonateAt: number; key: number }

const rand = (n: number) => (Math.random() * n) | 0;
const manhattan = (ax: number, ay: number, bx: number, by: number) => Math.abs(ax - bx) + Math.abs(ay - by);

function blastCells(bx: number, by: number): string[] {
  const cells = [`${bx},${by}`];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of dirs) {
    for (let i = 1; i <= BLAST; i++) {
      const x = bx + dx * i, y = by + dy * i;
      if (x < 0 || y < 0 || x >= GRID || y >= GRID) break;
      cells.push(`${x},${y}`);
    }
  }
  return cells;
}

function CtrlBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); onClick(); }}
      className="font-pixel flex h-14 w-14 items-center justify-center rounded-2xl border-[3px] bg-white text-base transition active:translate-x-[2px] active:translate-y-[2px]"
      style={{ borderColor: NAVY, color: NAVY, boxShadow: `3px 3px 0 ${NAVY}` }}
    >
      {label}
    </button>
  );
}

/** Solo demo: you vs 3 bomber bots. No wallet, no chain. */
export function BomberDemo() {
  const [players, setPlayers] = useState<SimPlayer[]>(() => [
    { addr: SELF, name: "YOU", x: 0, y: 0, alive: true, isBot: false },
    ...BOTS.map((b) => ({ ...b, alive: true, isBot: true })),
  ]);
  const [bombs, setBombs] = useState<SimBomb[]>([]);
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [tick, setTick] = useState(0);
  const [started, setStarted] = useState(false);
  const [over, setOver] = useState<null | { win: boolean; by?: string }>(null);
  const stateRef = useRef({ players, bombs, tick, started, over });
  stateRef.current = { players, bombs, tick, started, over };
  const bombKey = useRef(0);

  const reset = useCallback(() => {
    setPlayers([
      { addr: SELF, name: "YOU", x: 0, y: 0, alive: true, isBot: false },
      ...BOTS.map((b) => ({ ...b, alive: true, isBot: true })),
    ]);
    setBombs([]);
    setFlashes([]);
    setTick(0);
    setOver(null);
    setStarted(true);
  }, []);

  const plant = useCallback((addr: `0x${string}`) => {
    const s = stateRef.current;
    if (!s.started || s.over) return;
    const p = s.players.find((q) => q.addr === addr);
    if (!p || !p.alive) return;
    if (s.bombs.some((b) => b.x === p.x && b.y === p.y)) return;
    bombKey.current += 1;
    const bomb: SimBomb = { x: p.x, y: p.y, detonateAt: s.tick + FUSE, key: bombKey.current };
    setBombs((bs) => [...bs, bomb]);
  }, []);

  const movePlayer = useCallback((dx: number, dy: number) => {
    const s = stateRef.current;
    if (!s.started || s.over) return;
    setPlayers((ps) =>
      ps.map((p) => {
        if (p.addr !== SELF || !p.alive) return p;
        const nx = Math.max(0, Math.min(GRID - 1, p.x + dx));
        const ny = Math.max(0, Math.min(GRID - 1, p.y + dy));
        return { ...p, x: nx, y: ny };
      })
    );
  }, []);

  // Main tick: bots act, bombs fuse, detonations + chains, eliminations.
  useEffect(() => {
    if (!started || over) return;
    const t = setInterval(() => {
      const s = stateRef.current;
      const me = s.players.find((p) => p.addr === SELF)!;
      let players = s.players.map((p) => ({ ...p }));
      let bombs = s.bombs.map((b) => ({ ...b }));
      const nextTick = s.tick + 1;

      // Bots act.
      for (const bot of players) {
        if (!bot.isBot || !bot.alive) continue;
        const distToMe = me.alive ? manhattan(bot.x, bot.y, me.x, me.y) : 99;
        const hasBomb = bombs.some((b) => b.x === bot.x && b.y === bot.y);
        if (!hasBomb && (distToMe <= 3 ? Math.random() < 0.35 : Math.random() < 0.08)) {
          bombKey.current += 1;
          bombs.push({ x: bot.x, y: bot.y, detonateAt: nextTick + FUSE, key: bombKey.current });
        } else {
          // Random step, avoid bomb tiles.
          const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]]
            .map(([dx, dy]) => ({ x: bot.x + dx, y: bot.y + dy }))
            .filter((c) => c.x >= 0 && c.y >= 0 && c.x < GRID && c.y < GRID)
            .filter((c) => !bombs.some((b) => b.x === c.x && b.y === c.y));
          if (opts.length > 0) {
            const c = opts[rand(opts.length)];
            bot.x = c.x; bot.y = c.y;
          }
        }
      }

      // Detonate due bombs (with chains).
      const blast = new Set<string>();
      let queue = bombs.filter((b) => b.detonateAt <= nextTick);
      const exploded = new Set<number>();
      while (queue.length > 0) {
        const b = queue.shift()!;
        if (exploded.has(b.key)) continue;
        exploded.add(b.key);
        for (const c of blastCells(b.x, b.y)) blast.add(c);
        for (const other of bombs) {
          if (!exploded.has(other.key) && blast.has(`${other.x},${other.y}`)) queue.push(other);
        }
      }
      bombs = bombs.filter((b) => !exploded.has(b.key));

      // Eliminations.
      for (const p of players) {
        if (p.alive && blast.has(`${p.x},${p.y}`)) p.alive = false;
      }

      const newFlashes: Flash[] = [...blast].map((k) => {
        const [x, y] = k.split(",").map(Number);
        return { x, y, key: nextTick * 1000 + x * GRID + y };
      });

      setPlayers(players);
      setBombs(bombs);
      setFlashes(newFlashes);
      setTick(nextTick);

      const meAlive = players.find((p) => p.addr === SELF)!.alive;
      const botsAlive = players.filter((p) => p.isBot && p.alive);
      if (!meAlive) {
        const winnerBot = botsAlive[0];
        setOver({ win: false, by: winnerBot ? winnerBot.name : "the blast" });
      } else if (botsAlive.length === 0) {
        setOver({ win: true });
      }
    }, TICK_MS);
    return () => clearInterval(t);
  }, [started, over]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const moves: Record<string, [number, number]> = {
        arrowup: [0, -1], w: [0, -1],
        arrowdown: [0, 1], s: [0, 1],
        arrowleft: [-1, 0], a: [-1, 0],
        arrowright: [1, 0], d: [1, 0],
      };
      if (moves[k]) {
        e.preventDefault();
        movePlayer(...moves[k]);
      } else if (k === " ") {
        e.preventDefault();
        plant(SELF);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [movePlayer, plant]);

  const gridPlayers: PlayerState[] = players.map((p) => ({
    address: p.addr, x: p.x, y: p.y, alive: p.alive,
  }));
  const gridBombs: BombState[] = bombs.map((b) => ({
    x: b.x, y: b.y, planter: SELF, detonateAt: b.detonateAt, live: true,
  }));
  const me = players.find((p) => p.addr === SELF)!;
  const aliveBots = players.filter((p) => p.isBot && p.alive).length;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div
        className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border-[3px] bg-white px-4 py-3"
        style={{ borderColor: NAVY, boxShadow: `4px 4px 0 ${NAVY}` }}
      >
        <span className="font-pixel text-[10px]" style={{ color: NAVY }}>🎮 SOLO DEMO</span>
        <span className="font-pixel text-[10px]" style={{ color: BLUE }}>{aliveBots} BOTS LEFT</span>
        <span className="text-xs font-bold" style={{ color: NAVY, opacity: 0.6 }}>no wallet · no stakes</span>
        <span className="ml-auto">
          {me.alive ? (
            <span className="font-pixel rounded-full border-2 px-2.5 py-1 text-[9px]" style={{ borderColor: NAVY, background: "#22c55e", color: "#fff" }}>● YOU'RE IN</span>
          ) : (
            <span className="font-pixel rounded-full border-2 px-2.5 py-1 text-[9px]" style={{ borderColor: NAVY, background: "#ef4444", color: "#fff" }}>ELIMINATED</span>
          )}
        </span>
      </div>

      <Cartridge label="★ VIPER ARENA ★ DEMO">
        <div className="relative">
          <ArenaGrid
            players={gridPlayers}
            bombs={gridBombs}
            flashes={flashes}
            blockNumber={tick}
            self={SELF}
            selfPos={me.alive ? { x: me.x, y: me.y } : null}
            path={[]}
            drawing={false}
            onPathStart={() => {}}
            onPathExtend={() => {}}
          />
          {!started && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl" style={{ background: "rgba(11,18,48,0.7)" }}>
              <ChunkyButton onClick={reset}>▶ START DEMO</ChunkyButton>
            </div>
          )}
        </div>
      </Cartridge>

      {started && me.alive && !over && (
        <>
          <div className="mt-8 flex items-center justify-center gap-8">
            <div className="grid grid-cols-3 gap-2">
              <div />
              <CtrlBtn label="↑" onClick={() => movePlayer(0, -1)} />
              <div />
              <CtrlBtn label="←" onClick={() => movePlayer(-1, 0)} />
              <CtrlBtn label="↓" onClick={() => movePlayer(0, 1)} />
              <CtrlBtn label="→" onClick={() => movePlayer(1, 0)} />
            </div>
            <button
              onPointerDown={(e) => { e.preventDefault(); plant(SELF); }}
              className="font-pixel flex h-24 w-24 items-center justify-center rounded-full border-4 text-[11px] text-white transition active:scale-95"
              style={{ borderColor: NAVY, background: AMBER, boxShadow: `5px 5px 0 ${NAVY}`, textShadow: `2px 2px 0 ${NAVY}` }}
            >
              BOMB
            </button>
          </div>
          <p className="mt-4 text-center text-xs font-bold" style={{ color: NAVY, opacity: 0.65 }}>
            Arrows / WASD to move · Space or BOMB to plant · bombs blow in 3 ticks, blast 2 tiles
          </p>
        </>
      )}

      {over && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(11,18,48,0.7)" }}>
          <Card className="w-full max-w-sm text-center">
            <div className="font-pixel text-xl leading-relaxed" style={{ color: NAVY }}>
              {over.win ? "🏆 YOU WIN!" : "💥 ELIMINATED"}
            </div>
            <div className="mt-3 text-sm font-medium" style={{ color: NAVY, opacity: 0.75 }}>
              {over.win ? "Last bomber standing — the real arena pays the pot." : `Taken out — ${over.by} takes this one.`}
            </div>
            <div className="mt-6">
              <ChunkyButton onClick={reset} className="w-full">PLAY AGAIN →</ChunkyButton>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

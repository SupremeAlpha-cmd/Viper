"use client";

import type { PlayerState, BombState, Flash } from "../lib/useViper";
import { GRID, shortAddr } from "../lib/contract";

interface Props {
  players: PlayerState[];
  bombs: BombState[];
  flashes: Flash[];
  blockNumber: number;
  self?: string;
}

/** The 11×11 arena. Players, live bombs and explosion flashes. */
export function ArenaGrid({ players, bombs, flashes, blockNumber, self }: Props) {
  const cellPlayers = new Map<string, PlayerState[]>();
  for (const p of players) {
    if (!p.alive) continue;
    const k = `${p.x},${p.y}`;
    cellPlayers.set(k, [...(cellPlayers.get(k) || []), p]);
  }
  const cellBombs = new Map<string, BombState>();
  for (const b of bombs) cellBombs.set(`${b.x},${b.y}`, b);
  const cellFlash = new Map<string, number>();
  for (const f of flashes) cellFlash.set(`${f.x},${f.y}`, f.key);

  const cells = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const k = `${x},${y}`;
      const ps = cellPlayers.get(k) || [];
      const bomb = cellBombs.get(k);
      const flashKey = cellFlash.get(k);
      cells.push(
        <div
          key={k}
          className="relative aspect-square rounded-[3px] bg-white/[0.025] ring-1 ring-white/[0.06]"
        >
          {flashKey !== undefined && (
            <div
              key={flashKey}
              className="viper-flash absolute inset-0 rounded-[3px] bg-viper-500/70"
            />
          )}
          {bomb && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="flex h-[62%] w-[62%] animate-pulse items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-black"
                title={`Detonates in ${Math.max(0, bomb.detonateAt - blockNumber)} blocks`}
              >
                {Math.max(0, bomb.detonateAt - blockNumber)}
              </div>
            </div>
          )}
          {ps.length > 0 && (
            <div className="absolute inset-0 flex items-center justify-center gap-0.5 p-[12%]">
              {ps.map((p) => {
                const isSelf =
                  self && p.address.toLowerCase() === self.toLowerCase();
                return (
                  <div
                    key={p.address}
                    title={shortAddr(p.address)}
                    className={`h-full max-h-6 w-full max-w-6 rounded-full ring-2 ${
                      isSelf
                        ? "bg-viper-500 ring-viper-200"
                        : "bg-zinc-300 ring-zinc-100"
                    }`}
                  />
                );
              })}
            </div>
          )}
        </div>
      );
    }
  }

  return (
    <div
      className="grid w-full gap-[3px] rounded-xl border border-white/10 bg-black/40 p-2"
      style={{ gridTemplateColumns: `repeat(${GRID}, minmax(0, 1fr))` }}
    >
      {cells}
    </div>
  );
}

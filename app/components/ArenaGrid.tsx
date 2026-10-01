"use client";

import type { PlayerState, BombState, Flash } from "../lib/useViper";
import { GRID, shortAddr } from "../lib/contract";
import { NAVY, BLUE, AMBER } from "./cartoon";

interface Props {
  players: PlayerState[];
  bombs: BombState[];
  flashes: Flash[];
  blockNumber: number;
  self?: string;
  /** Our tile — path drawing must start here. */
  selfPos: { x: number; y: number } | null;
  /** Target cells drawn so far (excluding the start tile). */
  path: { x: number; y: number }[];
  drawing: boolean;
  onPathStart: () => void;
  onPathExtend: (x: number, y: number) => void;
}

/** The 11×11 arena — cartoonish board rendered inside the Cartridge screen. */
export function ArenaGrid({
  players,
  bombs,
  flashes,
  blockNumber,
  self,
  selfPos,
  path,
  drawing,
  onPathStart,
  onPathExtend,
}: Props) {
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
  const pathIdx = new Map<string, number>();
  path.forEach((c, i) => pathIdx.set(`${c.x},${c.y}`, i));
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const k = `${x},${y}`;
      const ps = cellPlayers.get(k) || [];
      const bomb = cellBombs.get(k);
      const flashKey = cellFlash.get(k);
      const checker = (x + y) % 2 === 0;
      const isSelfTile =
        selfPos !== null && selfPos.x === x && selfPos.y === y;
      const stepNum = pathIdx.get(k);
      cells.push(
        <div
          key={k}
          onPointerDown={(e) => {
            if (isSelfTile) {
              e.preventDefault();
              onPathStart();
            }
          }}
          onPointerEnter={() => {
            if (drawing) onPathExtend(x, y);
          }}
          className="relative aspect-square rounded-[3px]"
          style={{
            background: checker ? "#16204d" : "#0e1533",
            cursor: isSelfTile ? "crosshair" : undefined,
            // The gesture starts here: kill touch scrolling on this tile
            // from the first contact so the drag never becomes a page scroll.
            touchAction: isSelfTile ? "none" : undefined,
            // Path highlight: warm amber wash with the step number.
            boxShadow:
              stepNum !== undefined
                ? "inset 0 0 0 2px #f59e0b"
                : undefined,
          }}
        >
          {stepNum !== undefined && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className="font-pixel text-[8px] text-white"
                style={{ textShadow: `1px 1px 0 ${NAVY}` }}
              >
                {stepNum + 1}
              </span>
            </div>
          )}
          {flashKey !== undefined && (
            <div
              key={flashKey}
              className="boom-flash absolute inset-0 rounded-[3px]"
              style={{
                background:
                  "radial-gradient(circle, #fde047 0%, #fb923c 55%, #ef4444 100%)",
              }}
            />
          )}
          {bomb && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="font-pixel flex h-[68%] w-[68%] animate-pulse items-center justify-center rounded-full border-2 text-[9px] text-white"
                style={{
                  borderColor: NAVY,
                  background: AMBER,
                  textShadow: `1px 1px 0 ${NAVY}`,
                }}
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
                    title={
                      shortAddr(p.address) +
                      (p.optimistic ? " (confirming…)" : "")
                    }
                    className={
                      "h-full max-h-6 w-full max-w-6 rounded-full border-2" +
                      (p.optimistic ? " animate-pulse" : "")
                    }
                    style={{
                      borderColor: isSelf ? "#fff" : NAVY,
                      borderStyle: p.optimistic ? "dashed" : "solid",
                      background: isSelf ? BLUE : "#fff",
                      boxShadow: `1px 1px 0 ${NAVY}`,
                      opacity: p.optimistic ? 0.75 : 1,
                    }}
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
      className="grid w-full gap-[3px]"
      style={{ gridTemplateColumns: `repeat(${GRID}, minmax(0, 1fr))` }}
    >
      {cells}
    </div>
  );
}

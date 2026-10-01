"use client";

import React, { useMemo } from "react";
import {
  Team,
  TEAM_META,
  LADDERS,
  SNAKES,
  LADDER_MAP,
  SNAKE_MAP,
  WINNING_SQUARE,
} from "./contract";
import { NAVY } from "../components/cartoon";

interface BoardProps {
  positions: [number, number, number, number];
  currentTurn: Team;
  phase: "lobby" | "live" | null;
  lastRoll?: { team: Team; dice: number; from: number; to: number } | null;
}

export function getTileCoords(tile: number): { x: number; y: number } {
  if (tile < 1) tile = 1;
  if (tile > 100) tile = 100;
  const rowFromBottom = Math.floor((tile - 1) / 10);
  const colInRow = (tile - 1) % 10;
  const col = rowFromBottom % 2 === 0 ? colInRow : 9 - colInRow;
  const rowFromTop = 9 - rowFromBottom;
  const x = col * 10 + 5;
  const y = rowFromTop * 10 + 5;
  return { x, y };
}

export function Board({ positions, currentTurn, phase, lastRoll }: BoardProps) {
  // Tile elements (100 to 1)
  const tiles = useMemo(() => {
    const list = [];
    for (let tile = 1; tile <= 100; tile++) {
      const isLadderStart = LADDER_MAP[tile] !== undefined;
      const isLadderEnd = Object.values(LADDER_MAP).includes(tile);
      const isSnakeHead = SNAKE_MAP[tile] !== undefined;
      const isSnakeTail = Object.values(SNAKE_MAP).includes(tile);
      const isWin = tile === WINNING_SQUARE;

      const { x, y } = getTileCoords(tile);

      // Alternating checker pattern
      const rowFromBottom = Math.floor((tile - 1) / 10);
      const colInRow = (tile - 1) % 10;
      const isEvenCell = (rowFromBottom + colInRow) % 2 === 0;

      list.push({
        tile,
        x,
        y,
        isEvenCell,
        isLadderStart,
        isLadderEnd,
        isSnakeHead,
        isSnakeTail,
        isWin,
      });
    }
    return list;
  }, []);

  // Compute ladder rail paths and rungs for SVG
  const ladderSvgs = useMemo(() => {
    return LADDERS.map(([from, to]) => {
      const p1 = getTileCoords(from);
      const p2 = getTileCoords(to);

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy) || 1;
      const offsetDist = 1.6; // rail half-width in %
      const nx = (-dy / dist) * offsetDist;
      const ny = (dx / dist) * offsetDist;

      const leftRail = {
        x1: p1.x + nx,
        y1: p1.y + ny,
        x2: p2.x + nx,
        y2: p2.y + ny,
      };
      const rightRail = {
        x1: p1.x - nx,
        y1: p1.y - ny,
        x2: p2.x - nx,
        y2: p2.y - ny,
      };

      const rungs = [];
      const numRungs = Math.max(3, Math.floor(dist / 6));
      for (let i = 1; i <= numRungs; i++) {
        const t = i / (numRungs + 1);
        rungs.push({
          x1: leftRail.x1 + (leftRail.x2 - leftRail.x1) * t,
          y1: leftRail.y1 + (leftRail.y2 - leftRail.y1) * t,
          x2: rightRail.x1 + (rightRail.x2 - rightRail.x1) * t,
          y2: rightRail.y1 + (rightRail.y2 - rightRail.y1) * t,
        });
      }

      return { from, to, leftRail, rightRail, rungs };
    });
  }, []);

  // Compute snake paths for SVG
  const snakeSvgs = useMemo(() => {
    return SNAKES.map(([from, to], idx) => {
      const head = getTileCoords(from);
      const tail = getTileCoords(to);

      const dx = tail.x - head.x;
      const dy = tail.y - head.y;
      const dist = Math.hypot(dx, dy) || 1;

      // Curved wavy spline between head and tail
      const midX = (head.x + tail.x) / 2;
      const midY = (head.y + tail.y) / 2;
      const wave = (idx % 2 === 0 ? 1 : -1) * (dist * 0.22);
      const perpX = (-dy / dist) * wave;
      const perpY = (dx / dist) * wave;

      const c1x = head.x + (dx * 0.25) + perpX;
      const c1y = head.y + (dy * 0.25) + perpY;
      const c2x = head.x + (dx * 0.75) - perpX;
      const c2y = head.y + (dy * 0.75) - perpY;

      const pathData = `M ${head.x} ${head.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tail.x} ${tail.y}`;

      return { from, to, head, tail, pathData };
    });
  }, []);

  // Count how many tokens are on the same square to apply offsets
  const tokenOffsets: Record<Team, { x: number; y: number }> = {
    [Team.RED]: { x: -1.6, y: -1.6 },
    [Team.BLUE]: { x: 1.6, y: -1.6 },
    [Team.GREEN]: { x: -1.6, y: 1.6 },
    [Team.YELLOW]: { x: 1.6, y: 1.6 },
  };

  return (
    <div className="relative mx-auto w-full max-w-[580px]">
      {/* 10x10 Board container */}
      <div
        className="relative aspect-square w-full select-none overflow-hidden rounded-2xl border-[4px] p-1.5 shadow-2xl"
        style={{
          borderColor: NAVY,
          background: "#080d24",
          boxShadow: `8px 8px 0 ${NAVY}`,
        }}
      >
        {/* Tiles Grid */}
        <div className="relative grid h-full w-full grid-cols-10 grid-rows-10 gap-1 rounded-xl bg-[#090f2b] p-1">
          {tiles.map((t) => {
            const rowFromTop = 9 - Math.floor((t.tile - 1) / 10);
            const colInRow = (t.tile - 1) % 10;
            const col = Math.floor((t.tile - 1) / 10) % 2 === 0 ? colInRow : 9 - colInRow;

            let tileBg = t.isEvenCell ? "#10193d" : "#172352";
            if (t.isWin) tileBg = "#3b1740";

            return (
              <div
                key={t.tile}
                className="relative flex flex-col justify-between rounded-[4px] p-1 text-[9px] font-bold transition"
                style={{
                  gridColumn: col + 1,
                  gridRow: rowFromTop + 1,
                  background: tileBg,
                  color: t.isWin ? "#f43f5e" : "#94a3b8",
                }}
              >
                {/* Tile Number */}
                <span className="font-pixel text-[8px] opacity-75">{t.tile}</span>

                {/* Badge glyphs */}
                <div className="absolute bottom-0.5 right-0.5 text-[9px] pointer-events-none">
                  {t.isWin && <span title="GOAL: Square 100">🏆</span>}
                  {t.isLadderStart && <span title={`Ladder to ${LADDER_MAP[t.tile]}`}>🪜</span>}
                  {t.isSnakeHead && <span title={`Snake to ${SNAKE_MAP[t.tile]}`}>🐍</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* SVG Overlay: Ladders and Snakes */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <defs>
            <filter id="glow-gold" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="0.8" floodColor="#f59e0b" floodOpacity="0.8" />
            </filter>
            <filter id="glow-snake" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="0.8" floodColor="#ef4444" floodOpacity="0.8" />
            </filter>
          </defs>

          {/* Ladders */}
          {ladderSvgs.map((l) => (
            <g key={`ladder-${l.from}-${l.to}`} filter="url(#glow-gold)">
              {/* Left & Right Rails */}
              <line
                x1={l.leftRail.x1}
                y1={l.leftRail.y1}
                x2={l.leftRail.x2}
                y2={l.leftRail.y2}
                stroke="#fbbf24"
                strokeWidth="0.8"
                strokeLinecap="round"
              />
              <line
                x1={l.rightRail.x1}
                y1={l.rightRail.y1}
                x2={l.rightRail.x2}
                y2={l.rightRail.y2}
                stroke="#fbbf24"
                strokeWidth="0.8"
                strokeLinecap="round"
              />
              {/* Rungs */}
              {l.rungs.map((r, i) => (
                <line
                  key={`rung-${i}`}
                  x1={r.x1}
                  y1={r.y1}
                  x2={r.x2}
                  y2={r.y2}
                  stroke="#fef08a"
                  strokeWidth="0.6"
                  strokeLinecap="round"
                />
              ))}
            </g>
          ))}

          {/* Snakes */}
          {snakeSvgs.map((s, idx) => (
            <g key={`snake-${s.from}-${s.to}`} filter="url(#glow-snake)">
              {/* Snake Body */}
              <path
                d={s.pathData}
                fill="none"
                stroke={idx % 2 === 0 ? "#ef4444" : "#ec4899"}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeDasharray="2 1"
                opacity="0.9"
              />
              {/* Snake Head */}
              <circle cx={s.head.x} cy={s.head.y} r="1.6" fill="#ef4444" stroke="#ffffff" strokeWidth="0.5" />
              {/* Snake Eyes */}
              <circle cx={s.head.x - 0.4} cy={s.head.y - 0.4} r="0.3" fill="#ffffff" />
              <circle cx={s.head.x + 0.4} cy={s.head.y - 0.4} r="0.3" fill="#ffffff" />
              {/* Snake Tail */}
              <circle cx={s.tail.x} cy={s.tail.y} r="0.8" fill="#f87171" />
            </g>
          ))}
        </svg>

        {/* Team Tokens on Board */}
        {([Team.RED, Team.BLUE, Team.GREEN, Team.YELLOW] as Team[]).map((team) => {
          const pos = positions[team];
          if (pos <= 0) return null; // In start camp

          const meta = TEAM_META[team];
          const coords = getTileCoords(pos);
          const isTurn = phase === "live" && currentTurn === team;
          const offset = tokenOffsets[team];

          return (
            <div
              key={`token-${team}`}
              className="absolute z-20 flex items-center justify-center transition-all duration-500 ease-out"
              style={{
                left: `${coords.x + offset.x}%`,
                top: `${coords.y + offset.y}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <div
                className={`relative flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full border-2 text-[10px] font-bold shadow-lg ${
                  isTurn ? "animate-bounce ring-2 ring-white ring-offset-2 ring-offset-[#080d24]" : ""
                }`}
                style={{
                  background: meta.color,
                  borderColor: "#ffffff",
                  color: "#ffffff",
                }}
                title={`${meta.label}: Square ${pos}`}
              >
                {meta.glyph}
              </div>
            </div>
          );
        })}
      </div>

      {/* Start Base / Team Token Camp (Square 0) */}
      <div
        className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border-[3px] bg-white px-3 py-2"
        style={{ borderColor: NAVY, boxShadow: `4px 4px 0 ${NAVY}` }}
      >
        <span className="font-pixel text-[10px]" style={{ color: NAVY }}>
          START CAMP:
        </span>
        <div className="flex items-center gap-3">
          {([Team.RED, Team.BLUE, Team.GREEN, Team.YELLOW] as Team[]).map((team) => {
            const pos = positions[team];
            const meta = TEAM_META[team];
            const isTurn = phase === "live" && currentTurn === team;

            return (
              <div
                key={`camp-${team}`}
                className="flex items-center gap-1.5 rounded-lg border-2 px-2 py-1 text-xs"
                style={{
                  borderColor: meta.border,
                  background: isTurn ? meta.bgLight : "#ffffff",
                }}
              >
                <div
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-white"
                  style={{ background: meta.color }}
                >
                  {meta.glyph}
                </div>
                <div className="flex flex-col">
                  <span className="font-pixel text-[9px] font-bold" style={{ color: meta.border }}>
                    {meta.name}
                  </span>
                  <span className="text-[10px] font-semibold text-zinc-600">
                    {pos === 0 ? "At start" : `Sq ${pos}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

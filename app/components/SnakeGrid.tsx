"use client";

import { useEffect, useRef } from "react";
import { SNAKE_GRID, SNAKE_COLORS } from "../lib/snake";
import type { SnakePlayer } from "../lib/useSnake";
import { unpackCell } from "../lib/useSnake";

const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

const COIN_TYPES = [
  { symbol: "₿", bg: "#f7931a", fg: "#ffffff", name: "BTC" },  // Bitcoin
  { symbol: "Ξ", bg: "#627eea", fg: "#ffffff", name: "ETH" },  // Ethereum
  { symbol: "Ð", bg: "#c2a633", fg: "#ffffff", name: "DOGE" }, // Dogecoin
  { symbol: "S", bg: "#9945ff", fg: "#ffffff", name: "SOL" },  // Solana
];

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function SnakeGrid({
  players,
  coins,
  deaths,
  self,
}: {
  players: SnakePlayer[];
  coins: number[];
  deaths: { x: number; y: number; key: number }[];
  self?: `0x${string}` | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const cell = size / SNAKE_GRID;

    // Board.
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(148,163,184,0.08)";
    ctx.lineWidth = 1;
    for (let i = 1; i < SNAKE_GRID; i++) {
      ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(size, i * cell); ctx.stroke();
    }

    // Coins — popular crypto logos (big, recognizable).
    for (const c of coins) {
      const [x, y] = unpackCell(c);
      const cx = x * cell + cell / 2;
      const cy = y * cell + cell / 2;
      const r = cell * 0.42;
      const coin = COIN_TYPES[c % COIN_TYPES.length];
      // Coin body with rim.
      ctx.fillStyle = coin.bg;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 2;
      ctx.stroke();
      // Inner ring.
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2);
      ctx.stroke();
      // Symbol — large and bold.
      ctx.fillStyle = coin.fg;
      ctx.font = `bold ${r * 1.1}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(coin.symbol, cx, cy + 1);
    }

    // Snakes: draw tails first so heads sit on top.
    players.forEach((p, pi) => {
      if (!p.alive && p.segments.length === 0) return;
      const color = SNAKE_COLORS[pi % SNAKE_COLORS.length];
      const isSelf = self && p.address.toLowerCase() === self.toLowerCase();
      const segs = p.segments;
      for (let i = segs.length - 1; i >= 0; i--) {
        const [x, y] = unpackCell(segs[i]);
        const px = x * cell;
        const py = y * cell;
        const isHead = i === 0;
        const fade = p.alive ? 1 : 0.35;
        ctx.globalAlpha = fade;
        if (isHead) {
          ctx.fillStyle = shade(color, 30);
          ctx.beginPath();
          ctx.roundRect(px + 1, py + 1, cell - 2, cell - 2, cell * 0.35);
          ctx.fill();
          // Eyes look along the heading.
          const [dx, dy] = DIRS[p.dir] || [0, 0];
          ctx.fillStyle = "#0b1020";
          const ex = px + cell / 2 + (dx * cell) / 5;
          const ey = py + cell / 2 + (dy * cell) / 5;
          const ox = (-dy * cell) / 5;
          const oy = (dx * cell) / 5;
          ctx.beginPath(); ctx.arc(ex + ox, ey + oy, cell * 0.09, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(ex - ox, ey - oy, cell * 0.09, 0, Math.PI * 2); ctx.fill();
          if (isSelf) {
            ctx.globalAlpha = 1;
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(px + 1, py + 1, cell - 2, cell - 2, cell * 0.35);
            ctx.stroke();
          }
        } else {
          const t = i / Math.max(1, segs.length);
          ctx.fillStyle = shade(color, -Math.round(t * 60));
          ctx.beginPath();
          ctx.roundRect(px + 2, py + 2, cell - 4, cell - 4, cell * 0.3);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    });

    // Death flashes.
    for (const d of deaths) {
      const cx = d.x * cell + cell / 2;
      const cy = d.y * cell + cell / 2;
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 1.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }, [players, coins, deaths, self]);

  return (
    <canvas
      ref={ref}
      width={720}
      height={720}
      className="h-auto w-full rounded-2xl"
      style={{ imageRendering: "auto" }}
    />
  );
}

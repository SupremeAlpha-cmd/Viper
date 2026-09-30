"use client";

/*
 * ArenaMotif — animated 11x11 battle grid for the landing page.
 * A bomb sits at center; its cross-shaped blast pulses outward on a loop.
 * Pure CSS grid + keyframes. DESIGNERS: swap tile colors, timing, or the
 * blast shape here — the layout around it won't care.
 */

const GRID = 11;
const C = 5; // center tile
const R = 3; // blast radius, matches the contract

function blastDistance(x: number, y: number): number | null {
  const dx = Math.abs(x - C);
  const dy = Math.abs(y - C);
  if (dx === 0 && dy <= R) return dy;
  if (dy === 0 && dx <= R) return dx;
  return null;
}

export function ArenaMotif() {
  const tiles = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const d = blastDistance(x, y);
      const isCenter = x === C && y === C;
      tiles.push(
        <div
          key={`${x}-${y}`}
          className={d !== null ? "motif-blast" : "motif-tile"}
          style={
            d !== null
              ? ({ "--bd": d } as React.CSSProperties)
              : undefined
          }
          data-center={isCenter || undefined}
        />
      );
    }
  }
  return (
    <div className="motif-wrap" aria-hidden="true">
      <style>{`
        .motif-wrap {
          display: grid;
          grid-template-columns: repeat(11, 1fr);
          gap: 3px;
          width: min(320px, 70vw);
          aspect-ratio: 1;
          margin-inline: auto;
          opacity: 0.9;
        }
        .motif-tile {
          border-radius: 3px;
          background: rgba(255,255,255,0.05);
        }
        .motif-blast {
          border-radius: 3px;
          background: rgba(255,255,255,0.05);
          animation: motif-blast 2.4s ease-in-out infinite;
          animation-delay: calc(var(--bd) * 0.18s);
        }
        .motif-blast[data-center] { background: rgba(255,255,255,0.14); }
        @keyframes motif-blast {
          0%, 55%, 100% { background: rgba(255,255,255,0.05); }
          12%, 40% { background: rgba(163,230,53,0.85); }
        }
        @media (prefers-reduced-motion: reduce) {
          .motif-blast { animation: none; background: rgba(163,230,53,0.35); }
        }
      `}</style>
      {tiles}
    </div>
  );
}

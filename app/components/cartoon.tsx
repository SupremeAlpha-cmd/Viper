import type { ReactNode } from "react";

/* Shared cartoonish design tokens — mirrors the arcade homepage so the game screen
   feels like the same product. Do not restyle the homepage from here. */
export const NAVY = "#0b1230";
export const SKY = "#7cc4f5";
export const BLUE = "#2e7cf6";
export const AMBER = "#f59e0b";
export const CYAN = "#22d3ee";
export const SCREEN = "#070b22";

/** Chunky white card with thick navy outline + hard shadow. */
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl border-[3px] bg-white p-6 ${className}`}
      style={{ borderColor: NAVY, boxShadow: `6px 6px 0 ${NAVY}` }}
    >
      {children}
    </div>
  );
}

/** Small navy pixel kicker label. */
export function Kicker({ children }: { children: ReactNode }) {
  return (
    <p
      className="font-pixel mb-3 text-center text-[10px] uppercase"
      style={{ color: NAVY, letterSpacing: "0.3em" }}
    >
      {children}
    </p>
  );
}

/** Navy chunky button with hard shadow. */
export function ChunkyButton({
  children,
  onClick,
  disabled,
  title,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`font-pixel rounded-2xl border-[3px] px-6 py-3 text-[11px] text-white transition active:translate-x-[2px] active:translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      style={{
        borderColor: NAVY,
        background: NAVY,
        boxShadow: `4px 4px 0 rgba(11,18,48,0.35)`,
      }}
    >
      {children}
    </button>
  );
}

/** SNES-cartridge frame for the arena board (same pattern as the homepage). */
export function Cartridge({
  children,
  label = "★ VIPER ★",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <div
      className="relative mx-auto w-full rounded-[28px] border-[3px] p-5 pt-8"
      style={{
        borderColor: NAVY,
        background: "#aab4c4",
        boxShadow: `10px 10px 0 ${NAVY}`,
      }}
    >
      {/* vent slots */}
      <div
        className="mx-auto mb-4 h-4 w-2/3 rounded-full opacity-60"
        style={{
          background: `repeating-linear-gradient(90deg, ${NAVY} 0 10px, transparent 10px 22px)`,
        }}
      />
      {/* screws */}
      {["left-4 top-4", "right-4 top-4", "bottom-4 left-4", "bottom-4 right-4"].map(
        (pos) => (
          <div
            key={pos}
            className={`absolute ${pos} h-4 w-4 rounded-full border-2`}
            style={{ borderColor: NAVY, background: "#7c8698" }}
          />
        )
      )}
      {/* screen */}
      <div
        className="overflow-hidden rounded-2xl border-[3px] p-2"
        style={{ borderColor: NAVY, background: SCREEN }}
      >
        {children}
      </div>
      <p className="font-pixel mt-4 text-center text-sm" style={{ color: NAVY }}>
        {label}
      </p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

/**
 * HowToOverlay — themed how-to card shown on entering a game.
 * Dismiss once, remembered per game in localStorage (`viper-howto-<game>`).
 * Each game passes its own theme + rules.
 */
export function HowToOverlay({
  game,
  title,
  icon,
  tagline,
  rules,
  accent = "#22c55e",
}: {
  game: string;
  title: string;
  icon: string;
  tagline: string;
  rules: string[];
  accent?: string;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(`viper-howto-${game}`)) setShow(true);
    } catch {
      setShow(true);
    }
  }, [game]);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(`viper-howto-${game}`, "1");
    } catch { /* private mode */ }
    setShow(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(4,8,16,0.82)" }}
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-3xl border-2 bg-[#0b1020] p-6 sm:p-8"
        style={{ borderColor: accent, boxShadow: `0 0 60px ${accent}33` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center text-5xl">{icon}</div>
        <h2
          className="font-pixel mt-4 text-center text-lg leading-relaxed"
          style={{ color: accent }}
        >
          {title}
        </h2>
        <p className="mt-2 text-center text-sm font-medium text-zinc-400">
          {tagline}
        </p>
        <ul className="mt-6 space-y-3">
          {rules.map((r, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-zinc-200">
              <span
                className="font-pixel mt-0.5 shrink-0 text-[10px]"
                style={{ color: accent }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="leading-relaxed">{r}</span>
            </li>
          ))}
        </ul>
        <button
          onClick={dismiss}
          className="font-pixel mt-8 w-full rounded-2xl py-4 text-xs text-black transition active:scale-[0.98]"
          style={{ background: accent }}
        >
          GOT IT — PLAY →
        </button>
      </div>
    </div>
  );
}

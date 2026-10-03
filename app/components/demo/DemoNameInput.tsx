"use client";

import { useState } from "react";
import { getPlayerName, setPlayerName } from "../../lib/leaderboard";

/**
 * Inline display-name input for the daily leaderboard.
 * Renders nothing once a name is stored. `variant` matches the demo's style.
 */
export function DemoNameInput({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const [name, setName] = useState(() => getPlayerName() ?? "");
  const [saved, setSaved] = useState(() => getPlayerName() !== null);
  const [err, setErr] = useState("");

  if (saved) return null;

  const dark = variant === "dark";
  const commit = () => {
    if (setPlayerName(name)) {
      setSaved(true);
      setErr("");
    } else {
      setErr("2–20 chars: letters, numbers, space, _ . -");
    }
  };

  return (
    <div className="mb-4">
      <div
        className="rounded-2xl border-2 px-4 py-3"
        style={
          dark
            ? { borderColor: "#26314d", background: "#0b1020" }
            : { borderColor: "#0b1230", background: "#fff", boxShadow: "4px 4px 0 #0b1230" }
        }
      >
        <p
          className="font-pixel text-[10px]"
          style={{ color: dark ? "#22c55e" : "#0b1230" }}
        >
          🏆 DAILY LEADERBOARD — ENTER YOUR NAME
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
            maxLength={20}
            placeholder="Your name"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border-2 px-3 py-2 text-sm font-bold outline-none"
            style={
              dark
                ? { borderColor: "#26314d", background: "#131a2e", color: "#fff" }
                : { borderColor: "#0b1230", background: "#f8fafc", color: "#0b1230" }
            }
          />
          <button
            onClick={commit}
            className="font-pixel shrink-0 rounded-xl px-4 py-2 text-[10px] transition active:scale-95"
            style={
              dark
                ? { background: "#22c55e", color: "#000" }
                : { background: "#0b1230", color: "#fff" }
            }
          >
            SAVE
          </button>
        </div>
        {err && <p className="mt-1 text-xs font-bold text-red-500">{err}</p>}
        {!err && (
          <p className="mt-1 text-[11px] font-medium" style={{ color: dark ? "#71717a" : "#0b1230", opacity: 0.7 }}>
            One entry per day per game. Champions split the $30 daily pool.
          </p>
        )}
      </div>
    </div>
  );
}

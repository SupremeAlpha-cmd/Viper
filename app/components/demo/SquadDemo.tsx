"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SQUAD_COLORS, SQUAD_ACCENT, SQUAD_BG } from "../../lib/squad-game";

const RED = SQUAD_ACCENT;
const ROUNDS = 8;
const BOT_NAMES = ["Viper_01", "xXslayer", "degen.eth", "0xghost", "moonbag", "rekt_ronin", "satoshi_jr", "ape_strong", "hogfather", "ngmi_nate", "diamond_d"];

interface Racer { name: string; alive: boolean; checkedIn: boolean; checkAt: number; isYou: boolean }

const freshRoster = (): Racer[] => [
  { name: "YOU", alive: true, checkedIn: false, checkAt: 0, isYou: true },
  ...BOT_NAMES.map((n) => ({ name: n, alive: true, checkedIn: false, checkAt: 0, isYou: false })),
];

type Phase = "idle" | "green" | "red" | "over";

/** Solo demo: red-light/green-light survival vs 11 bots. No wallet, no chain. */
export function SquadDemo() {
  const [roster, setRoster] = useState<Racer[]>(freshRoster);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [secsLeft, setSecsLeft] = useState(0);
  const [toasts, setToasts] = useState<{ key: number; text: string }[]>([]);
  const [won, setWon] = useState<boolean | null>(null);
  const stateRef = useRef({ roster, round, phase, won });
  stateRef.current = { roster, round, phase, won };
  const toastKey = useRef(0);

  const pushToast = useCallback((text: string) => {
    toastKey.current += 1;
    const key = toastKey.current;
    setToasts((t) => [...t.slice(-3), { key, text }]);
  }, []);

  // Token guard: restarting mid-round invalidates all pending timers.
  const roundToken = useRef(0);

  const startRound = useCallback((roundNum: number, racers: Racer[]) => {
    const tk = ++roundToken.current;
    const greenMs = 3000 + Math.random() * 3000;
    const now = Date.now();
    // Bots schedule their check-ins; ~15% never make it.
    const next = racers.map((r) => {
      if (!r.alive) return r;
      if (r.isYou) return { ...r, checkedIn: false, checkAt: 0 };
      const ghost = Math.random() < 0.15;
      return { ...r, checkedIn: false, checkAt: ghost ? Infinity : now + Math.random() * (greenMs - 400) };
    });
    setRoster(next);
    setRound(roundNum);
    setPhase("green");
    setSecsLeft(Math.ceil(greenMs / 1000));

    const tickInt = setInterval(() => {
      if (roundToken.current !== tk) { clearInterval(tickInt); return; }
      setSecsLeft((s) => Math.max(0, s - 1));
    }, 1000);

    // Bot check-ins land during green.
    const botTimers = next
      .filter((r) => r.alive && !r.isYou && r.checkAt !== Infinity)
      .map((r) =>
        setTimeout(() => {
          if (roundToken.current !== tk) return;
          setRoster((rs) => rs.map((q) => (q.name === r.name && q.alive ? { ...q, checkedIn: true } : q)));
        }, Math.max(0, r.checkAt - now))
      );

    setTimeout(() => {
      if (roundToken.current !== tk) return;
      clearInterval(tickInt);
      botTimers.forEach(clearTimeout);
      // RED LIGHT — resolve.
      setRoster((rs) => {
        const alive = rs.filter((r) => r.alive);
        const checked = alive.filter((r) => r.checkedIn).sort((a, b) => a.checkAt - b.checkAt);
        const missed = alive.filter((r) => !r.checkedIn);
        // Slowest quartile of the checked-in goes too (bots only — you're safe if you checked in).
        const slowCount = Math.floor(checked.filter((r) => !r.isYou).length / 4);
        const slow = checked.filter((r) => !r.isYou).slice(-slowCount).map((r) => r.name);
        const dead = new Set([...missed.map((r) => r.name), ...slow]);
        const survivors = rs.map((r) => (r.alive && dead.has(r.name) ? { ...r, alive: false } : r));
        return survivors;
      });
      setPhase("red");

      const s = stateRef.current;
      const aliveNow = s.roster.filter((r) => r.alive);
      const missedNames = aliveNow.filter((r) => !r.checkedIn).map((r) => (r.isYou ? "YOU" : r.name));
      const youDead = missedNames.includes("YOU");
      const botsAlive = aliveNow.filter((r) => !r.isYou && r.checkedIn);
      const slowCount = Math.floor(botsAlive.length / 4);
      const slowNames = [...botsAlive].sort((a, b) => b.checkAt - a.checkAt).slice(0, slowCount).map((r) => r.name);
      [...missedNames.filter((n) => n !== "YOU"), ...slowNames].slice(0, 4).forEach((n) =>
        pushToast(`💀 ${n} eliminated`)
      );
      if (youDead) pushToast("💀 YOU missed the window");

      setTimeout(() => {
        if (roundToken.current !== tk) return;
        const cur = stateRef.current;
        const youAlive = cur.roster.find((r) => r.isYou)!.alive;
        const botsLeft = cur.roster.filter((r) => !r.isYou && r.alive).length;
        if (!youAlive) {
          setWon(false);
          setPhase("over");
        } else if (roundNum >= ROUNDS || botsLeft === 0) {
          setWon(true);
          setPhase("over");
        } else {
          const survivors = cur.roster;
          pushToast(`🟢 ROUND ${roundNum + 1} — GREEN LIGHT`);
          startRound(roundNum + 1, survivors);
        }
      }, 2200);
    }, greenMs);
  }, [pushToast]);

  const start = useCallback(() => {
    const r = freshRoster();
    setRoster(r);
    setToasts([]);
    setWon(null);
    pushToast("🟢 ROUND 1 — GREEN LIGHT");
    startRound(1, r);
  }, [startRound, pushToast]);

  const checkIn = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== "green") return;
    const you = s.roster.find((r) => r.isYou)!;
    if (!you.alive || you.checkedIn) return;
    setRoster((rs) => rs.map((r) => (r.isYou ? { ...r, checkedIn: true, checkAt: Date.now() } : r)));
  }, []);

  // Spacebar to check in.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        checkIn();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [checkIn]);

  // Invalidate timers on unmount.
  useEffect(() => () => { roundToken.current += 1; }, []);

  const you = roster.find((r) => r.isYou)!;
  const aliveCount = roster.filter((r) => r.alive).length;
  const checkedCount = roster.filter((r) => r.alive && r.checkedIn).length;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border-2 px-4 py-3"
        style={{ borderColor: "#3f1d24", background: SQUAD_BG }}>
        <span className="font-pixel text-[10px]" style={{ color: RED }}>🎮 SOLO DEMO</span>
        {phase !== "idle" && phase !== "over" && (
          <span className="font-pixel text-[10px]" style={{ color: RED }}>ROUND #{round}/{ROUNDS}</span>
        )}
        {phase === "green" && <span className="font-pixel text-[10px] text-green-400">🟢 GREEN LIGHT · {secsLeft}s</span>}
        {phase === "red" && <span className="font-pixel animate-pulse text-[10px]" style={{ color: RED }}>🔴 RED LIGHT</span>}
        <span className="font-pixel text-[10px]" style={{ color: RED }}>{aliveCount} ALIVE</span>
        <span className="ml-auto text-xs font-bold text-zinc-500">no wallet · no stakes</span>
      </div>

      {toasts.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {toasts.map((t) => (
            <div key={t.key} className="rounded-xl border border-[#3f1d24] bg-[#16090c] px-4 py-2 text-xs font-bold text-zinc-300">
              {t.text}
            </div>
          ))}
        </div>
      )}

      {phase === "idle" && (
        <div className="rounded-3xl border-2 p-8 text-center" style={{ borderColor: "#3f1d24", background: SQUAD_BG }}>
          <div className="text-4xl">🦑</div>
          <div className="font-pixel mt-3 text-sm leading-relaxed text-zinc-100">SURVIVE {ROUNDS} ROUNDS</div>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
            🟢 GREEN LIGHT: smash <span className="font-bold text-zinc-100">CHECK IN</span> before the timer hits zero.
            🔴 RED LIGHT: miss the window and you're out. 11 bots are racing you.
          </p>
          <button
            onClick={start}
            className="font-pixel mt-6 rounded-2xl px-8 py-4 text-sm text-black transition active:scale-[0.98]"
            style={{ background: RED }}
          >
            ▶ START DEMO
          </button>
        </div>
      )}

      {(phase === "green" || phase === "red") && you.alive && !you.checkedIn && phase === "green" && (
        <button
          onClick={checkIn}
          className="font-pixel mb-5 w-full rounded-3xl py-6 text-sm text-black transition active:scale-[0.98]"
          style={{ background: RED, boxShadow: `0 0 40px ${RED}55` }}
        >
          ✅ CHECK IN — GREEN LIGHT
        </button>
      )}
      {(phase === "green" || phase === "red") && you.alive && you.checkedIn && (
        <div className="font-pixel mb-5 w-full rounded-3xl border-2 border-green-800 bg-[#07130c] py-5 text-center text-xs text-green-300">
          ✓ YOU'RE SAFE THIS ROUND — WAIT FOR RED LIGHT
        </div>
      )}
      {phase === "red" && you.alive && (
        <p className="mb-5 text-center text-xs font-bold text-zinc-500">Resolving round…</p>
      )}

      {phase === "over" && (
        <div className="mb-5 rounded-3xl border-2 p-8 text-center" style={{ borderColor: "#3f1d24", background: SQUAD_BG }}>
          <div className="font-pixel text-lg leading-relaxed" style={{ color: RED }}>
            {won ? "👑 LAST ONE STANDING!" : "💀 ELIMINATED"}
          </div>
          <p className="mt-3 text-sm text-zinc-400">
            {won ? "You outlasted every bot. The real game pays the pot — this was practice." : "The bots were faster this time. Run it back!"}
          </p>
          <button
            onClick={start}
            className="font-pixel mt-6 rounded-2xl px-8 py-4 text-sm text-black transition active:scale-[0.98]"
            style={{ background: RED }}
          >
            PLAY AGAIN →
          </button>
        </div>
      )}

      {(phase === "green" || phase === "red" || phase === "over") && (
        <div className="rounded-3xl border-2 p-4" style={{ borderColor: "#3f1d24", background: SQUAD_BG }}>
          <div className="font-pixel mb-3 text-[10px] uppercase tracking-widest text-zinc-500">
            Squad — {checkedCount}/{aliveCount} checked in
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {roster.map((p, i) => (
              <div
                key={p.name}
                className="flex items-center gap-2 rounded-xl border px-2.5 py-1.5"
                style={{
                  borderColor: p.isYou ? RED : "#2a1218",
                  background: p.alive ? "#16090c" : "#0d0d12",
                  opacity: p.alive ? 1 : 0.45,
                }}
              >
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: SQUAD_COLORS[i % SQUAD_COLORS.length] }} />
                <span className="font-pixel truncate text-[9px] text-zinc-200">{p.name}</span>
                <span className="ml-auto text-[11px]">{!p.alive ? "💀" : p.checkedIn ? "✅" : "⏳"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {phase === "green" && you.alive && !you.checkedIn && (
        <p className="mt-4 text-center text-xs font-bold text-zinc-500">
          Press <span className="font-pixel text-[10px] text-zinc-300">SPACE</span> or tap the button · miss the window and you're out
        </p>
      )}
    </div>
  );
}

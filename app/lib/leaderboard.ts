// Daily leaderboard client — Viper solo demos.
// Winner determination is server-side; payouts are manual.
// Endpoint: NEXT_PUBLIC_LEADERBOARD_URL (default http://localhost:3001).

const LB_URL =
  process.env.NEXT_PUBLIC_LEADERBOARD_URL || "http://localhost:3001";

const NAME_KEY = "viper_player_name";
const NAME_RE = /^[A-Za-z0-9 _.\-]{2,20}$/;

export type LbGame = "snake" | "snakes-ladders" | "squad-game";

export function getPlayerName(): string | null {
  try {
    const v = (localStorage.getItem(NAME_KEY) || "").trim();
    return v || null;
  } catch {
    return null;
  }
}

export function setPlayerName(name: string): boolean {
  const v = name.trim();
  if (!NAME_RE.test(v)) return false;
  try {
    localStorage.setItem(NAME_KEY, v);
  } catch {
    /* ignore */
  }
  return true;
}

export function isValidName(name: string): boolean {
  return NAME_RE.test(name.trim());
}

/** Fire-and-forget score submission. Never throws. */
export async function submitScore(
  game: LbGame,
  score: number,
  tiebreak?: number
): Promise<void> {
  try {
    const name = getPlayerName();
    if (!name) return; // no name, no contest entry
    const res = await fetch(`${LB_URL}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game,
        name,
        score: Math.round(score),
        tiebreak: tiebreak == null ? undefined : Math.round(tiebreak),
      }),
    });
    if (!res.ok) console.warn("[leaderboard] submit rejected", res.status);
  } catch (e) {
    console.warn("[leaderboard] submit failed", e);
  }
}

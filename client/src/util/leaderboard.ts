// Local high-score table (P2). P3 will add a server-backed leaderboard.
export interface ScoreRow { name: string; score: number; }
const KEY = "micdrop_solo_leaderboard";

export function getScores(): ScoreRow[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

export function qualifies(score: number): boolean {
  const s = getScores();
  return score > 0 && (s.length < 10 || score > (s[s.length - 1]?.score ?? 0));
}

// Store the player's FULL name (the phone username, or a typed solo name), capped
// only so it fits the leaderboard row. Was previously chopped to 3 upper-case
// initials, which mangled real usernames; now the complete name is kept.
export const NAME_MAX = 14;

export function addScore(name: string, score: number): ScoreRow[] {
  const s = getScores();
  const clean = name.trim().slice(0, NAME_MAX) || "ANON";
  s.push({ name: clean, score });
  s.sort((a, b) => b.score - a.score);
  const top = s.slice(0, 10);
  localStorage.setItem(KEY, JSON.stringify(top));
  return top;
}

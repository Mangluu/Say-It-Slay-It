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

export function addScore(name: string, score: number): ScoreRow[] {
  const s = getScores();
  s.push({ name: (name.slice(0, 3).toUpperCase() || "AAA"), score });
  s.sort((a, b) => b.score - a.score);
  const top = s.slice(0, 10);
  localStorage.setItem(KEY, JSON.stringify(top));
  return top;
}

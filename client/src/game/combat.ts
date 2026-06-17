// Knockback model adapted from the SSBWiki formula. Numbers come only from the
// archetype stat-table, so flavor can never affect power.
//   p = victim percent (after this hit), d = damage, w = weight
export function knockback(percent: number, damage: number, baseKB: number, growthKB: number, weight = 100): number {
  return (((percent / 10 + (percent * damage) / 20) * (200 / (weight + 100)) * 1.4) + 18) * growthKB + baseKB;
}

// Convert a knockback magnitude + direction into a launch velocity (m/s).
export function launchVelocity(kb: number, dirX: number): { x: number; y: number } {
  const angle = (50 * Math.PI) / 180; // launch up and away
  const speed = kb * 0.9; // tuning scale
  const sx = dirX >= 0 ? 1 : -1;
  return { x: Math.cos(angle) * speed * sx, y: Math.sin(angle) * speed };
}

export function hitstunFor(kb: number): number {
  return Math.min(0.6, 0.12 + kb * 0.012);
}

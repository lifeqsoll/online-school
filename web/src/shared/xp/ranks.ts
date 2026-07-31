export type Rank = {
  id: string;
  title: string;
  minXp: number;
  hint: string;
};

/** Cumulative XP thresholds (sum across courses). */
export const RANKS: Rank[] = [
  { id: 'novice', title: 'Новичок', minXp: 0, hint: 'Первые шаги в олимпиадах' },
  { id: 'student', title: 'Ученик', minXp: 100, hint: 'Осваиваешь базу' },
  { id: 'practitioner', title: 'Практик', minXp: 200, hint: 'Решаешь задачи уверенно' },
  { id: 'expert', title: 'Знаток', minXp: 350, hint: 'Глубоко понимаешь темы' },
  { id: 'olympian', title: 'Олимпиадник', minXp: 500, hint: 'Готов к серьёзным стартам' },
  { id: 'prize', title: 'Призёр', minXp: 750, hint: 'Уровень призёра' },
  { id: 'master', title: 'Мастер', minXp: 1000, hint: 'Топ среди учеников' },
  { id: 'gm', title: 'Гроссмейстер', minXp: 1500, hint: 'Максимальный ранг' },
];

export type RankProgress = {
  current: Rank;
  next: Rank | null;
  totalXp: number;
  /** XP needed to reach next rank (0 if max) */
  xpToNext: number;
  /** Progress within current→next segment 0..100 */
  percent: number;
  /** Denominator shown in widget (next.minXp or current.minXp at max) */
  barMax: number;
};

export function getRankProgress(totalXp: number): RankProgress {
  const xp = Math.max(0, Math.floor(totalXp));
  let current = RANKS[0];
  for (const r of RANKS) {
    if (xp >= r.minXp) current = r;
  }
  const idx = RANKS.findIndex((r) => r.id === current.id);
  const next = idx >= 0 && idx < RANKS.length - 1 ? RANKS[idx + 1] : null;

  if (!next) {
    return {
      current,
      next: null,
      totalXp: xp,
      xpToNext: 0,
      percent: 100,
      barMax: current.minXp || xp || 1,
    };
  }

  const span = next.minXp - current.minXp;
  const gained = xp - current.minXp;
  const percent = span <= 0 ? 100 : Math.min(100, Math.round((gained / span) * 100));

  return {
    current,
    next,
    totalXp: xp,
    xpToNext: Math.max(0, next.minXp - xp),
    percent,
    barMax: next.minXp,
  };
}

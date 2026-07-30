export type GradeResult = { isCorrect: boolean; points: number };

export function gradeChoice(
  correctKeys: string[],
  selected: string[],
  points: number,
): GradeResult {
  const a = new Set(correctKeys.map(String));
  const b = new Set(selected.map(String));
  if (a.size !== b.size) return { isCorrect: false, points: 0 };
  for (const k of a) {
    if (!b.has(k)) return { isCorrect: false, points: 0 };
  }
  return { isCorrect: true, points };
}

function normalizeExact(s: string): string {
  return s.trim().toLowerCase();
}

export function gradeShort(params: {
  match: 'EXACT' | 'NUMBER';
  correctKeys: string[];
  answer: string;
  tolerance?: number;
  points: number;
}): GradeResult {
  const { match, correctKeys, answer, points } = params;
  const tolerance = params.tolerance ?? 0;

  if (match === 'EXACT') {
    const normalized = normalizeExact(answer);
    const ok = correctKeys.some((k) => normalizeExact(String(k)) === normalized);
    return { isCorrect: ok, points: ok ? points : 0 };
  }

  const num = Number(String(answer).trim().replace(',', '.'));
  if (Number.isNaN(num)) return { isCorrect: false, points: 0 };
  const ok = correctKeys.some((k) => {
    const expected = Number(String(k).trim().replace(',', '.'));
    if (Number.isNaN(expected)) return false;
    return Math.abs(num - expected) <= tolerance;
  });
  return { isCorrect: ok, points: ok ? points : 0 };
}

export function computeScoreXp(
  maxXp: number,
  earnedPoints: number,
  totalPoints: number,
): number {
  if (totalPoints <= 0 || maxXp <= 0) return 0;
  return Math.round((maxXp * earnedPoints) / totalPoints);
}

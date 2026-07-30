import { computeScoreXp, gradeChoice, gradeShort } from './auto-grade';

describe('gradeChoice', () => {
  it('matches sets regardless of order', () => {
    expect(gradeChoice(['a', 'c'], ['c', 'a'], 5)).toEqual({
      isCorrect: true,
      points: 5,
    });
  });

  it('fails on partial multi', () => {
    expect(gradeChoice(['a', 'c'], ['a'], 5).isCorrect).toBe(false);
  });

  it('never awards points when correct keys or selection empty', () => {
    expect(gradeChoice([], [], 5)).toEqual({ isCorrect: false, points: 0 });
    expect(gradeChoice(['a'], [], 5)).toEqual({ isCorrect: false, points: 0 });
    expect(gradeChoice([], ['a'], 5)).toEqual({ isCorrect: false, points: 0 });
  });
});

describe('gradeShort', () => {
  it('EXACT is case-insensitive', () => {
    expect(
      gradeShort({
        match: 'EXACT',
        correctKeys: ['Paris'],
        answer: ' paris ',
        points: 2,
      }),
    ).toEqual({ isCorrect: true, points: 2 });
  });

  it('NUMBER respects tolerance', () => {
    expect(
      gradeShort({
        match: 'NUMBER',
        correctKeys: ['3.14'],
        answer: '3.141',
        tolerance: 0.01,
        points: 3,
      }).isCorrect,
    ).toBe(true);
    expect(
      gradeShort({
        match: 'NUMBER',
        correctKeys: ['3.14'],
        answer: '3.2',
        tolerance: 0.01,
        points: 3,
      }).isCorrect,
    ).toBe(false);
  });
});

describe('computeScoreXp', () => {
  it('rounds proportionally', () => {
    expect(computeScoreXp(100, 3, 4)).toBe(75);
  });

  it('returns 0 when total is 0', () => {
    expect(computeScoreXp(100, 0, 0)).toBe(0);
  });

  it('returns 0 when nothing earned', () => {
    expect(computeScoreXp(100, 0, 15)).toBe(0);
  });
});

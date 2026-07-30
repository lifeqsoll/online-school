import { masteryFromScores } from './topic-mastery.service';

describe('masteryFromScores', () => {
  it('marks struggling when any < 0.25', () => {
    expect(masteryFromScores([0.2, 0.9])).toEqual({
      scorePct: 55,
      struggling: true,
    });
  });

  it('averages when all ok', () => {
    expect(masteryFromScores([0.5, 1])).toEqual({
      scorePct: 75,
      struggling: false,
    });
  });

  it('empty is not struggling', () => {
    expect(masteryFromScores([])).toEqual({ scorePct: 0, struggling: false });
  });
});

/** Human-readable homework type for lists and results. */
export function assignmentTypeLabel(
  responseMode?: string | null,
  questions?: Array<{ type: string }> | null,
): string {
  const mode = responseMode ?? 'QUIZ';
  if (mode === 'FILE') return 'Развёрнутое';
  if (mode === 'QUIZ_AND_FILE') return 'Смешанное';

  const types = (questions ?? []).map((q) => q.type);
  const hasAuto = types.some((t) => t === 'CHOICE' || t === 'SHORT');
  const hasOpen = types.some((t) => t === 'OPEN');

  if (hasAuto && hasOpen) return 'Смешанное';
  if (hasOpen && !hasAuto) return 'Развёрнутое';
  return 'Тест';
}

export function responseModeSelectLabel(mode: string): string {
  if (mode === 'FILE') return 'Развёрнутое (файл)';
  if (mode === 'QUIZ_AND_FILE') return 'Смешанное (тест + файл)';
  return 'Тест';
}

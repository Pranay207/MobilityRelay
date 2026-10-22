import type { Question } from './types.js';

export function displayAnswer(question: Question, sourceLabel: string | undefined): string {
  if (!question.answerSourceId) return question.answer;
  // Replace only the service-generated footer, never IDs inside a quoted report.
  const footer = `User-reviewed reply. Source: ${question.answerSourceId}. Reported, not independently verified.`;
  if (!question.answer.endsWith(`\n${footer}`)) return question.answer;
  return `${question.answer.slice(0, -footer.length)}User-reviewed reply. ${sourceLabel ?? 'Source unavailable'}. Reported, not independently verified.`;
}

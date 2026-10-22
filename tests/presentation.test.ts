import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayAnswer } from '../shared/presentation.js';
import type { Question } from '../shared/types.js';

const id = 'b473e27c-340e-45ed-a25a-859d31816d5b';
const answer = (text: string, answerSourceId?: string) => ({ answer: text, answerSourceId } as Question);

test('reviewed-answer display replaces only the generated footer and supports older records', () => {
  const quote = `Supplier said: Source: ${id}. Keep this exact quotation.`;
  const raw = `${quote}\nUser-reviewed reply. Source: ${id}. Reported, not independently verified.`;
  const question = answer(raw, id);
  assert.equal(displayAnswer(question, 'Source 3'), `${quote}\nUser-reviewed reply. Source 3. Reported, not independently verified.`);
  assert.match(displayAnswer(question, undefined), /User-reviewed reply\. Source unavailable\./);
  assert.equal(question.answer, raw);
});

test('manual answers and nonmatching footers stay verbatim', () => {
  const raw = `Source: ${id}. This is a user-written answer.`;
  assert.equal(displayAnswer(answer(raw), 'Source 3'), raw);
  assert.equal(displayAnswer(answer(raw, id), 'Source 3'), raw);
  const footer = `User-reviewed reply. Source: ${id}. Reported, not independently verified.`;
  assert.equal(displayAnswer(answer(footer), 'Source 3'), footer);
  assert.equal(displayAnswer(answer(`Original quote\n${footer} Extra note`, id), 'Source 3'), `Original quote\n${footer} Extra note`);
});

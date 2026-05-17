/**
 * Shared fixtures and utilities for handler tests.
 *
 * `resetStorage` wipes the singleton MemoryStorage between tests so each
 * test starts from an empty store. Without this, items created in one test
 * leak into the next and assertions like "list returns N items" become
 * order-dependent.
 */

import { createStorage } from '../storage/index.js';
import { MemoryStorage } from '../storage/memory.js';

// Question was found online from a sample AP CS question bank
export const validItem = {
  subject: 'AP Computer Science A',
  itemType: 'multiple-choice',
  difficulty: 3,
  content: {
    question: [
      'Consider the following code segment.',
      '',
      'for (int k = 0; k < 20; k = k + 2)',
      '{',
      '  if (k % 3 == 1)',
      '  {',
      '    System.out.print(k + " ");',
      '  }',
      '}',
      '',
      'What is printed as a result of executing the code segment?',
    ].join('\n'),
    options: [
      '4 16',
      '4 10 16',
      '0 6 12 18',
      '1 4 7 10 13 16 19',
      '0 2 4 6 8 10 12 14 16 18',
    ],
    correctAnswer: '4 10 16',
    explanation:
      'The loop iterates k over even values 0, 2, 4, ..., 18. The condition ' +
      'k % 3 == 1 is true only for k = 4, 10, and 16, so those values are printed.',
  },
  metadata: { author: 'Fulton', status: 'draft', tags: ['java', 'loops', 'modulo'] },
  securityLevel: 'standard',
} as const;

export function bodyOf<T = unknown>(res: { body: unknown }): T {
  return res.body as T;
}

export function resetStorage(): void {
  const storage = createStorage();
  if (!(storage instanceof MemoryStorage)) {
    throw new Error('resetStorage is only valid against MemoryStorage');
  }
  storage.reset();
}

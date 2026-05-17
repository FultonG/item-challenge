import { describe, it, expect, beforeEach } from 'vitest';
import { createItemHandler } from '../handlers/createItem.js';
import { bodyOf, resetStorage, validItem } from './utils.js';

beforeEach(resetStorage);

describe('createItem', () => {
  it('creates a multiple-choice item and returns 201', async () => {
    const res = await createItemHandler(validItem);
    expect(res.statusCode).toBe(201);
    const item = bodyOf<{ id: string; metadata: { version: number; created: number } }>(res);
    expect(item.id).toBeTruthy();
    expect(item.metadata.version).toBe(1);
    expect(item.metadata.created).toBeTypeOf('number');
  });

  it('rejects difficulty out of range with VALIDATION_FAILED + path', async () => {
    const res = await createItemHandler({ ...validItem, difficulty: 7 });
    expect(res.statusCode).toBe(400);
    const body = bodyOf<{ error: { code: string; details: { path: string }[] } }>(res);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details.some((d) => d.path === 'difficulty')).toBe(true);
  });

  it('rejects multiple-choice with correctAnswer not in options', async () => {
    const res = await createItemHandler({
      ...validItem,
      content: { ...validItem.content, correctAnswer: 'Z' },
    });
    expect(res.statusCode).toBe(400);
    const body = bodyOf<{ error: { details: { path: string }[] } }>(res);
    expect(body.error.details.some((d) => d.path === 'content.correctAnswer')).toBe(true);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { createItemHandler } from '../handlers/createItem.js';
import { getItemHandler } from '../handlers/getItem.js';
import { bodyOf, resetStorage, validItem } from './utils.js';

beforeEach(resetStorage);

describe('getItem', () => {
  it('returns 404 with ITEM_NOT_FOUND for unknown ids', async () => {
    const res = await getItemHandler({ id: '00000000-0000-4000-8000-000000000000' });
    expect(res.statusCode).toBe(404);
    expect(bodyOf<{ error: { code: string } }>(res).error.code).toBe('ITEM_NOT_FOUND');
  });

  it('rejects non-UUID ids with 400 VALIDATION_FAILED', async () => {
    const res = await getItemHandler({ id: 'not-a-uuid' });
    expect(res.statusCode).toBe(400);
    expect(bodyOf<{ error: { code: string } }>(res).error.code).toBe('VALIDATION_FAILED');
  });

  it('round-trips an item created via the create handler', async () => {
    const create = await createItemHandler(validItem);
    const { id } = bodyOf<{ id: string }>(create);
    const res = await getItemHandler({ id });
    expect(res.statusCode).toBe(200);
    expect(bodyOf<{ id: string; subject: string }>(res).subject).toBe('AP Computer Science A');
  });
});

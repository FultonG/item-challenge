import { describe, it, expect, beforeEach } from 'vitest';
import { createItemHandler } from '../handlers/createItem.js';
import { updateItemHandler } from '../handlers/updateItem.js';
import { bodyOf, resetStorage, validItem } from './utils.js';

beforeEach(resetStorage);

describe('updateItem', () => {
  it('bumps version and updates content', async () => {
    const create = await createItemHandler(validItem);
    const { id } = bodyOf<{ id: string }>(create);

    const res = await updateItemHandler({ id, body: { difficulty: 5 } });
    expect(res.statusCode).toBe(200);
    const item = bodyOf<{ difficulty: number; metadata: { version: number } }>(res);
    expect(item.difficulty).toBe(5);
    expect(item.metadata.version).toBe(2);
  });

  it('returns 404 when updating an unknown item', async () => {
    const res = await updateItemHandler({
      id: '00000000-0000-4000-8000-000000000000',
      body: { difficulty: 4 },
    });
    expect(res.statusCode).toBe(404);
  });
});

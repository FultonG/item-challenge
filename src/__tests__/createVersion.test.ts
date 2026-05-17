import { describe, it, expect, beforeEach } from 'vitest';
import { createItemHandler } from '../handlers/createItem.js';
import { createVersionHandler } from '../handlers/createVersion.js';
import { bodyOf, resetStorage, validItem } from './utils.js';

beforeEach(resetStorage);

describe('createVersion', () => {
  it('snapshots the current state and returns 201', async () => {
    const create = await createItemHandler(validItem);
    const { id } = bodyOf<{ id: string }>(create);

    const res = await createVersionHandler({ id });
    expect(res.statusCode).toBe(201);
    const snapshot = bodyOf<{ metadata: { version: number } }>(res);
    expect(snapshot.metadata.version).toBe(2);
  });

  it('returns 404 when versioning an unknown item', async () => {
    const res = await createVersionHandler({ id: '00000000-0000-4000-8000-000000000000' });
    expect(res.statusCode).toBe(404);
  });
});

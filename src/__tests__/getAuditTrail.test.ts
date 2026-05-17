import { describe, it, expect, beforeEach } from 'vitest';
import { getAuditTrailHandler } from '../handlers/getAuditTrail.js';
import { bodyOf, resetStorage, validItem } from './utils.js';
import { createItemHandler } from '../handlers/createItem.js';
import { updateItemHandler } from '../handlers/updateItem.js';
import { createVersionHandler } from '../handlers/createVersion.js';

beforeEach(resetStorage);

interface TrailEntry {
  version: number;
  lastModified: number;
  author: string;
  status: string;
  snapshot: { difficulty: number };
}
interface TrailResponse {
  id: string;
  total: number;
  versions: TrailEntry[];
}

describe('getAuditTrail', () => {
  it('returns 404 for an unknown item', async () => {
    const res = await getAuditTrailHandler({ id: '00000000-0000-4000-8000-000000000000' });
    expect(res.statusCode).toBe(404);
    expect(bodyOf<{ error: { code: string } }>(res).error.code).toBe('ITEM_NOT_FOUND');
  });

  it('rejects non-UUID ids with 400 VALIDATION_FAILED', async () => {
    const res = await getAuditTrailHandler({ id: 'not-a-uuid' });
    expect(res.statusCode).toBe(400);
    expect(bodyOf<{ error: { code: string } }>(res).error.code).toBe('VALIDATION_FAILED');
  });

  it('returns versions newest first with the documented shape', async () => {
    const create = await createItemHandler(validItem);
    const { id } = bodyOf<{ id: string }>(create);

    await updateItemHandler({ id, body: { difficulty: 5 } });
    await createVersionHandler({ id });

    const res = await getAuditTrailHandler({ id });
    expect(res.statusCode).toBe(200);

    const trail = bodyOf<TrailResponse>(res);
    expect(trail.id).toBe(id);
    expect(trail.total).toBe(3);
    expect(trail.versions.map((v) => v.version)).toEqual([3, 2, 1]);

    for (const v of trail.versions) {
      expect(typeof v.lastModified).toBe('number');
      expect(typeof v.author).toBe('string');
      expect(typeof v.status).toBe('string');
      expect(v.snapshot).toBeTruthy();
    }
  });

  it('reflects updateItem changes in the trail', async () => {
    const create = await createItemHandler(validItem);
    const { id } = bodyOf<{ id: string }>(create);

    await updateItemHandler({ id, body: { difficulty: 5 } });

    const res = await getAuditTrailHandler({ id });
    const trail = bodyOf<TrailResponse>(res);

    expect(trail.versions).toHaveLength(2);
    expect(trail.versions[0].snapshot.difficulty).toBe(5); // post-update (newest)
    expect(trail.versions[1].snapshot.difficulty).toBe(3); // original
  });
});

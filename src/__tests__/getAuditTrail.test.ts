import { describe, it, expect, beforeEach } from 'vitest';
import { getAuditTrailHandler } from '../handlers/getAuditTrail.js';
import { bodyOf, resetStorage, validItem } from './utils.js';

beforeEach(resetStorage);

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
});

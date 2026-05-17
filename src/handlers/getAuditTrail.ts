/**
 * GET /api/items/:id/audit — return the full version history of an item.
 *
 * One round-trip against the base table: Query PK=ITEM#<id>,
 * SK begins_with VERSION#. An empty result is "no such item" (404), since
 * every persisted item has at least one VERSION snapshot.
 */

import { createStorage } from '../storage/index.js';
import { itemIdSchema, formatZodErrors } from '../validators/itemValidators.js';
import { ok, error, HandlerResult } from '../utils/responses.js';

const storage = createStorage();

export async function getAuditTrailHandler(params: { id: string }): Promise<HandlerResult> {
  const parsed = itemIdSchema.safeParse(params.id);
  if (!parsed.success) {
    return error(400, 'VALIDATION_FAILED', 'Invalid id', formatZodErrors(parsed.error));
  }

  try {
    const versions = await storage.getAuditTrail(parsed.data);
    if (versions.length === 0) {
      return error(404, 'ITEM_NOT_FOUND', `Item ${parsed.data} not found`);
    }
    return ok({
      id: parsed.data,
      total: versions.length,
      versions: versions.map((v) => ({
        version: v.metadata.version,
        lastModified: v.metadata.lastModified,
        author: v.metadata.author,
        status: v.metadata.status,
        snapshot: v,
      })),
    });
  } catch (err) {
    console.error(JSON.stringify({ level: 'ERROR', handler: 'getAuditTrail', err: String(err) }));
    return error(500, 'INTERNAL_ERROR', 'Failed to get audit trail');
  }
}

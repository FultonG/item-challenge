/**
 * POST /api/items/:id/versions — snapshot the current item as a new version.
 *
 * Distinct from PUT in that it does not mutate content; it bumps the version
 * counter and appends a new VERSION snapshot. Useful for "save point"
 * workflows where authors want a checkpoint without an edit.
 */

import { createStorage } from '../storage/index.js';
import { itemIdSchema, formatZodErrors } from '../validators/itemValidators.js';
import { created, error, HandlerResult } from '../utils/responses.js';

const storage = createStorage();

export async function createVersionHandler(params: { id: string }): Promise<HandlerResult> {
  const parsed = itemIdSchema.safeParse(params.id);
  if (!parsed.success) {
    return error(400, 'VALIDATION_FAILED', 'Invalid id', formatZodErrors(parsed.error));
  }

  try {
    const item = await storage.createVersion(parsed.data);
    if (!item) {
      return error(404, 'ITEM_NOT_FOUND', `Item ${parsed.data} not found`);
    }
    return created(item);
  } catch (err) {
    console.error(JSON.stringify({ level: 'ERROR', handler: 'createVersion', err: String(err) }));
    return error(500, 'INTERNAL_ERROR', 'Failed to create version');
  }
}

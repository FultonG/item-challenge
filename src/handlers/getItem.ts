/**
 * GET /api/items/:id — retrieve a single item by id.
 */

import { createStorage } from '../storage/index.js';
import { itemIdSchema, formatZodErrors } from '../validators/itemValidators.js';
import { ok, error, HandlerResult } from '../utils/responses.js';

const storage = createStorage();

export async function getItemHandler(params: { id: string }): Promise<HandlerResult> {
  const parsed = itemIdSchema.safeParse(params.id);
  if (!parsed.success) {
    return error(400, 'VALIDATION_FAILED', 'Invalid id', formatZodErrors(parsed.error));
  }

  try {
    const item = await storage.getItem(parsed.data);
    if (!item) {
      return error(404, 'ITEM_NOT_FOUND', `Item ${parsed.data} not found`);
    }
    return ok(item);
  } catch (err) {
    console.error(JSON.stringify({ level: 'ERROR', handler: 'getItem', err: String(err) }));
    return error(500, 'INTERNAL_ERROR', 'Failed to get item');
  }
}

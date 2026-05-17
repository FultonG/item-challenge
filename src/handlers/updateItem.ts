/**
 * PUT /api/items/:id — partial update of an existing item.
 *
 * Each successful update bumps `metadata.version` and writes a new
 * VERSION snapshot. The audit endpoint reads those snapshots.
 */

import { createStorage } from '../storage/index.js';
import {
  itemIdSchema,
  updateItemRequestSchema,
  formatZodErrors,
} from '../validators/itemValidators.js';
import { ok, error, HandlerResult } from '../utils/responses.js';

const storage = createStorage();

export async function updateItemHandler(params: {
  id: string;
  body: unknown;
}): Promise<HandlerResult> {
  const idResult = itemIdSchema.safeParse(params.id);
  if (!idResult.success) {
    return error(400, 'VALIDATION_FAILED', 'Invalid id', formatZodErrors(idResult.error));
  }

  const bodyResult = updateItemRequestSchema.safeParse(params.body);
  if (!bodyResult.success) {
    return error(400, 'VALIDATION_FAILED', 'Request body failed validation', formatZodErrors(bodyResult.error));
  }

  try {
    const item = await storage.updateItem(idResult.data, bodyResult.data);
    if (!item) {
      return error(404, 'ITEM_NOT_FOUND', `Item ${idResult.data} not found`);
    }
    return ok(item);
  } catch (err) {
    console.error(JSON.stringify({ level: 'ERROR', handler: 'updateItem', err: String(err) }));
    return error(500, 'INTERNAL_ERROR', 'Failed to update item');
  }
}

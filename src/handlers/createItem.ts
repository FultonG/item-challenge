/**
 * POST /api/items — create a new exam item.
 */

import { createStorage } from '../storage/index.js';
import { createItemRequestSchema, formatZodErrors } from '../validators/itemValidators.js';
import { created, error, HandlerResult } from '../utils/responses.js';

const storage = createStorage();

export async function createItemHandler(params: unknown): Promise<HandlerResult> {
  const parsed = createItemRequestSchema.safeParse(params);
  if (!parsed.success) {
    return error(400, 'VALIDATION_FAILED', 'Request body failed validation', formatZodErrors(parsed.error));
  }

  try {
    const item = await storage.createItem(parsed.data);
    return created(item);
  } catch (err) {
    console.error(JSON.stringify({ level: 'ERROR', handler: 'createItem', message: 'storage.createItem failed', err: String(err) }));
    return error(500, 'INTERNAL_ERROR', 'Failed to create item');
  }
}

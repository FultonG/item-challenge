/**
 * GET /api/items — list items, optionally filtered by subject and/or status.
 *
 * Pagination is token-based. A response includes a `nextToken` field if
 * more items exist; the client passes that token back as `?nextToken=...` to
 * fetch the next page.
 */

import { createStorage } from '../storage/index.js';
import { listItemsQuerySchema, formatZodErrors } from '../validators/itemValidators.js';
import { ok, error, HandlerResult } from '../utils/responses.js';

const storage = createStorage();

export async function listItemsHandler(params: unknown): Promise<HandlerResult> {
  const parsed = listItemsQuerySchema.safeParse(params);
  if (!parsed.success) {
    return error(400, 'VALIDATION_FAILED', 'Invalid query parameters', formatZodErrors(parsed.error));
  }

  try {
    const result = await storage.listItems(parsed.data);
    return ok(result);
  } catch (err) {
    console.error(JSON.stringify({ level: 'ERROR', handler: 'listItems', err: String(err) }));
    return error(500, 'INTERNAL_ERROR', 'Failed to list items');
  }
}

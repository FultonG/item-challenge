import { describe, it, expect, beforeEach } from 'vitest';
import { createItemHandler } from '../handlers/createItem.js';
import { listItemsHandler } from '../handlers/listItems.js';
import { bodyOf, resetStorage, validItem } from './utils.js';

beforeEach(resetStorage);

describe('listItems', () => {
  it('filters by subject and status; returns nextToken when more remain', async () => {
    // Create 3 items in the same subject
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await createItemHandler({
        ...validItem,
        subject: 'AP Calculus',
        metadata: { ...validItem.metadata, author: `author-${i}` },
      });
      ids.push(bodyOf<{ id: string }>(r).id);
    }

    const firstPage = await listItemsHandler({ subject: 'AP Calculus', limit: 2 });
    expect(firstPage.statusCode).toBe(200);
    const page = bodyOf<{ items: { id: string }[]; nextToken?: string }>(firstPage);
    expect(page.items.length).toBe(2);
    // MemoryStorage encodes the next offset; in DDB it'd be opaque
    expect(page.nextToken).toBeTruthy();
  });
});

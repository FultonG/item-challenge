/**
 * DynamoDB Storage Implementation
 *
 *   PK = ITEM#<id>
 *   SK = CURRENT                   (live item)
 *      | VERSION#<padded-int>      (immutable history snapshot)
 *
 * Two global secondary indexes:
 *   - SubjectStatusIndex: PK=subject, SK=SK
 *     "List items by subject," restricted to CURRENT rows via KeyCondition
 *     (SK = 'CURRENT'). Status filter applied as a FilterExpression on
 *     metadata.status.
 *   - InverseIndex:    PK=SK
 *     "List all items globally" via KeyCondition (SK = 'CURRENT').
 *     Documented hot-partition risk — all CURRENT items share one GSI
 *     partition. Trade-off accepted at this scale; sharded variant called
 *     out as future work.
 *
 * Writes use TransactWriteItems so the CURRENT row and its VERSION
 * snapshot commit atomically. OCC on metadata.version protects against
 * lost updates from concurrent edits; attribute_not_exists(PK) on create
 * protects against duplicate IDs.
 *
 * Env:
 *   USE_DYNAMODB=true             - enable this backend (storage/index.ts)
 *   DYNAMODB_TABLE_NAME=ExamItems - table name override
 *   AWS_REGION=us-east-1          - AWS region
 *   DYNAMODB_ENDPOINT=http://...  - DynamoDB Local override (optional)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import {
  ExamItem,
  CreateItemRequest,
  UpdateItemRequest,
  ListItemsQuery,
  ListItemsResult,
} from '../types/item.js';
import { ItemStorage } from './interface.js';

const SK_CURRENT = 'CURRENT';
const VERSION_PAD = 10;

const itemPK = (id: string) => `ITEM#${id}`;
const versionSK = (n: number) => `VERSION#${String(n).padStart(VERSION_PAD, '0')}`;

type StoredItem = ExamItem & { PK: string; SK: string };

function toCurrentRow(item: ExamItem): StoredItem {
  return { ...item, PK: itemPK(item.id), SK: SK_CURRENT };
}
function toVersionRow(item: ExamItem): StoredItem {
  return { ...item, PK: itemPK(item.id), SK: versionSK(item.metadata.version) };
}
function stripKeys(stored: Record<string, unknown>): ExamItem {
  const { PK: _PK, SK: _SK, ...rest } = stored as unknown as StoredItem;
  return rest;
}

function encodeNextToken(key: Record<string, unknown> | undefined): string | undefined {
  if (!key) return undefined;
  return Buffer.from(JSON.stringify(key)).toString('base64url');
}
function decodeNextToken(token: string | undefined): Record<string, unknown> | undefined {
  if (!token) return undefined;
  try {
    return JSON.parse(Buffer.from(token, 'base64url').toString('utf-8'));
  } catch {
    return undefined;
  }
}

export class DynamoDBStorage implements ItemStorage {
  private client: DynamoDBDocumentClient;
  private tableName: string;
  private readonly subjectIndex = 'SubjectStatusIndex';
  private readonly inverseIndex = 'InverseIndex';

  constructor() {
    const ddb = new DynamoDBClient({
      region: process.env.AWS_REGION || 'us-east-1',
      ...(process.env.DYNAMODB_ENDPOINT && { endpoint: process.env.DYNAMODB_ENDPOINT }),
    });
    this.client = DynamoDBDocumentClient.from(ddb, {
      marshallOptions: { removeUndefinedValues: true },
    });
    this.tableName = process.env.DYNAMODB_TABLE_NAME || 'ExamItems';
  }

  async createItem(data: CreateItemRequest): Promise<ExamItem> {
    const now = Date.now();
    const item: ExamItem = {
      id: randomUUID(),
      ...data,
      metadata: {
        ...data.metadata,
        created: now,
        lastModified: now,
        version: 1,
      },
    };

    // Atomic: write CURRENT and VERSION#1 in one transaction.
    // attribute_not_exists guards against duplicate IDs
    await this.client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.tableName,
              Item: toCurrentRow(item),
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          { Put: { TableName: this.tableName, Item: toVersionRow(item) } },
        ],
      }),
    );

    return item;
  }

  async getItem(id: string): Promise<ExamItem | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: itemPK(id), SK: SK_CURRENT },
        ConsistentRead: true,
      }),
    );
    return result.Item ? stripKeys(result.Item) : null;
  }

  async updateItem(id: string, data: UpdateItemRequest): Promise<ExamItem | null> {
    const existing = await this.getItem(id);
    if (!existing) return null;

    const expected = existing.metadata.version;
    const updated: ExamItem = {
      ...existing,
      ...data,
      id: existing.id,
      content: data.content ? { ...existing.content, ...data.content } : existing.content,
      metadata: {
        ...existing.metadata,
        ...(data.metadata ?? {}),
        created: existing.metadata.created,
        lastModified: Date.now(),
        version: expected + 1,
      },
    };

    await this.client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.tableName,
              Item: toCurrentRow(updated),
              ConditionExpression: '#m.#v = :expected',
              ExpressionAttributeNames: { '#m': 'metadata', '#v': 'version' },
              ExpressionAttributeValues: { ':expected': expected },
            },
          },
          { Put: { TableName: this.tableName, Item: toVersionRow(updated) } },
        ],
      }),
    );

    return updated;
  }

  async listItems(query: ListItemsQuery): Promise<ListItemsResult> {
    const limit = query.limit ?? 10;
    const exclusiveStartKey = decodeNextToken(query.nextToken);

    const filterExpression = query.status ? '#m.#s = :status' : undefined;
    const filterNames = query.status
      ? { '#m': 'metadata', '#s': 'status' }
      : undefined;
    const filterValues = query.status ? { ':status': query.status } : {};

    let command: QueryCommand;
    if (query.subject) {
      // List by subject: PK=subject, SK=CURRENT
      command = new QueryCommand({
        TableName: this.tableName,
        IndexName: this.subjectIndex,
        KeyConditionExpression: 'subject = :subject AND SK = :sk',
        FilterExpression: filterExpression,
        ExpressionAttributeNames: filterNames,
        ExpressionAttributeValues: { ':subject': query.subject, ':sk': SK_CURRENT, ...filterValues },
        Limit: limit,
        ExclusiveStartKey: exclusiveStartKey,
      });
    } else {
      // Global list: PK=SK='CURRENT'
      command = new QueryCommand({
        TableName: this.tableName,
        IndexName: this.inverseIndex,
        KeyConditionExpression: 'SK = :sk',
        FilterExpression: filterExpression,
        ExpressionAttributeNames: filterNames,
        ExpressionAttributeValues: { ':sk': SK_CURRENT, ...filterValues },
        Limit: limit,
        ExclusiveStartKey: exclusiveStartKey,
      });
    }

    const result = await this.client.send(command);
    const items = (result.Items ?? []).map((i) => stripKeys(i));
    const nextToken = encodeNextToken(result.LastEvaluatedKey as Record<string, unknown> | undefined);

    return {
      items,
      ...(nextToken ? { nextToken } : {}),
    };
  }

  async createVersion(id: string): Promise<ExamItem | null> {
    // POST /api/items/:id/versions: snapshot current state without content
    // changes. Same atomicity contract as updateItem.
    const existing = await this.getItem(id);
    if (!existing) return null;

    const expected = existing.metadata.version;
    const bumped: ExamItem = {
      ...existing,
      metadata: {
        ...existing.metadata,
        lastModified: Date.now(),
        version: expected + 1,
      },
    };

    await this.client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.tableName,
              Item: toCurrentRow(bumped),
              ConditionExpression: '#m.#v = :expected',
              ExpressionAttributeNames: { '#m': 'metadata', '#v': 'version' },
              ExpressionAttributeValues: { ':expected': expected },
            },
          },
          { Put: { TableName: this.tableName, Item: toVersionRow(bumped) } },
        ],
      }),
    );

    return bumped;
  }

  async getAuditTrail(id: string): Promise<ExamItem[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': itemPK(id), ':prefix': 'VERSION#' },
        ScanIndexForward: false, // newest first
        ConsistentRead: true,
      }),
    );
    return (result.Items ?? []).map((i) => stripKeys(i));
  }
}

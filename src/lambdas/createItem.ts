import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createItemHandler } from '../handlers/createItem.js';
import { badJson, parseJsonBody, serialize } from './util.js';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = parseJsonBody(event);
  if (!body.ok) return badJson();
  return serialize(await createItemHandler(body.value));
}

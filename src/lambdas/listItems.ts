import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { listItemsHandler } from '../handlers/listItems.js';
import { serialize } from './util.js';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return serialize(await listItemsHandler(event.queryStringParameters ?? {}));
}

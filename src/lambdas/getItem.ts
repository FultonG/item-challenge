import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getItemHandler } from '../handlers/getItem.js';
import { serialize } from './util.js';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return serialize(await getItemHandler({ id: event.pathParameters?.id ?? '' }));
}

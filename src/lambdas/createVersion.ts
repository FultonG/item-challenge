import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createVersionHandler } from '../handlers/createVersion.js';
import { serialize } from './util.js';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return serialize(await createVersionHandler({ id: event.pathParameters?.id ?? '' }));
}

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getAuditTrailHandler } from '../handlers/getAuditTrail.js';
import { serialize } from './util.js';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return serialize(await getAuditTrailHandler({ id: event.pathParameters?.id ?? '' }));
}

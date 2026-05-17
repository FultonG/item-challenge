/**
 * Shared helpers for Lambda entry points.
 *
 * Each entry file extracts the handler's `params` shape from an
 * APIGatewayProxyEvent and serializes the response body to JSON. Keeping
 * this layer thin lets the underlying handlers stay scaffold-shaped
 * (`(params) => { statusCode, body }`) and easy to test directly.
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const baseHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export function serialize(result: { statusCode: number; body: unknown }): APIGatewayProxyResult {
  return {
    statusCode: result.statusCode,
    headers: baseHeaders,
    body: JSON.stringify(result.body),
  };
}

export function badJson(): APIGatewayProxyResult {
  return serialize({
    statusCode: 400,
    body: { error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } },
  });
}

export function parseJsonBody(event: APIGatewayProxyEvent): { ok: true; value: unknown } | { ok: false } {
  if (!event.body) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(event.body) };
  } catch {
    return { ok: false };
  }
}

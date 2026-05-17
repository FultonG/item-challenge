/**
 * Response helpers.
 *
 * The error envelope shape is part of the public API contract — every
 * client that handles failures depends on it. Centralizing the
 * construction here means a future change to the shape is a one-file
 * edit rather than a 12-call-site sweep, and the ErrorCode union keeps
 * the set of codes machine-checkable.
 */

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'ITEM_NOT_FOUND'
  | 'INVALID_JSON'
  | 'ROUTE_NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

interface ErrorDetail {
  path: string;
  message: string;
}

export interface HandlerResult {
  statusCode: number;
  body: unknown;
}

export function ok(body: unknown): HandlerResult {
  return { statusCode: 200, body };
}

export function created(body: unknown): HandlerResult {
  return { statusCode: 201, body };
}

export function error(
  statusCode: number,
  code: ErrorCode,
  message: string,
  details?: ErrorDetail[],
): HandlerResult {
  return {
    statusCode,
    body: {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
  };
}

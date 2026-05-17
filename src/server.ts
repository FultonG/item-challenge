/**
 * Local Development Server
 *
 * A simple HTTP server for testing your handlers locally.
 * Run with: pnpm dev
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { createItemHandler } from './handlers/createItem.js';
import { getItemHandler } from './handlers/getItem.js';
import { getAuditTrailHandler } from './handlers/getAuditTrail.js';

const PORT = process.env.PORT || 3000;

type HandlerResult = { statusCode: number; body: unknown };

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
function write(res: ServerResponse, result: HandlerResult): void {
  res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result.body));
}

const notFound: HandlerResult = {
  statusCode: 404,
  body: { error: { code: 'ROUTE_NOT_FOUND', message: 'No route for this method/path' } },
};

const invalidJson: HandlerResult = {
  statusCode: 400,
  body: { error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } },
};

async function route(req: IncomingMessage): Promise<HandlerResult> {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method ?? 'GET';

  // POST /api/items
  if (method === 'POST' && pathname === '/api/items') {
    const raw = await readBody(req);
    let body: unknown;
    try { body = raw ? JSON.parse(raw) : null; } catch { return invalidJson; }
    return createItemHandler(body);
  }

  // GET /api/items/:id/audit
  const auditMatch = pathname.match(/^\/api\/items\/([^/]+)\/audit$/);
  if (method === 'GET' && auditMatch) {
    return getAuditTrailHandler({ id: decodeURIComponent(auditMatch[1]) });
  }

  // GET /api/items/:id
  const idMatch = pathname.match(/^\/api\/items\/([^/]+)$/);
  if (idMatch) {
    const id = decodeURIComponent(idMatch[1]);
    if (method === 'GET') return getItemHandler({ id });
  }

  return notFound;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // CORS — permissive for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  console.log(`${req.method} ${req.url}`);

  try {
    const result = await route(req);
    write(res, result);
  } catch (err) {
    console.error('Unhandled server error:', err);
    write(res, {
      statusCode: 500,
      body: { error: { code: 'INTERNAL_ERROR', message: 'Unhandled error' } },
    });
  }
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error('Top-level error:', err);
    write(res, {
      statusCode: 500,
      body: { error: { code: 'INTERNAL_ERROR', message: 'Top-level error' } },
    });
  });
})

server.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`\n Endpoints:`);
  console.log('Routes:');
  console.log('  POST   /api/items');
  console.log('  GET    /api/items/:id');
  console.log('  GET    /api/items/:id/audit');
  console.log(`\nPress Ctrl+C to stop\n`);
});

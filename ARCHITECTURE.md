# Architecture

## Overview

Serverless CRUD service for exam items. API Gateway routes six REST endpoints to per-route Lambdas; each Lambda calls a shared handler that talks to DynamoDB through a small `ItemStorage` interface. The same handlers run locally against an in-memory backend so tests don't need AWS credentials.

The data model is a single DynamoDB table. Items live alongside their version snapshots under one partition key, so creating or updating an item writes both the current row and a new version in one `TransactWriteItems` call. That gives us an audit trail without a separate history table and without eventual-consistency questions about when the trail catches up to the live row.

Why serverless: traffic is bursty, the workload is request-driven CRUD, and idle cost is the main concern at this scale. Lambda and DynamoDB on-demand both bill at zero when nothing is happening.

## What Was Implemented

All six endpoints from the spec, end-to-end, against both backends. Run `pnpm test` for the test suite (15 tests across 6 files), `pnpm dev` for the local HTTP server, and `cd infrastructure && cdk synth -c stage=dev` to validate the CDK app.

**Application layer:**

- Handlers in `src/handlers/` use the scaffold signature `(params) => { statusCode, body }`. Lambda entry points in `src/lambdas/` translate `APIGatewayProxyEvent` into the handler's `params` shape and serialize the response. The local `server.ts` calls the same handlers directly, so test and production code paths are identical above the entry layer.
- `MemoryStorage` (default; used by tests and `pnpm dev`) and `DynamoDBStorage` selected by `USE_DYNAMODB=true`. The DynamoDB layer is the single-table design described below, including `TransactWriteItems` for atomic CURRENT + VERSION writes, OCC on `metadata.version`, `attribute_not_exists(PK)` on create, and base64url-encoded `nextToken` pagination on `listItems`.
- Zod validation with the multiple-choice cross-field rule (≥2 options and `correctAnswer ∈ options`). A shared response envelope (`src/utils/responses.ts`) so every handler returns the same `{ statusCode, body }` shape and the `ErrorCode` union is machine-checkable.

**Infrastructure (`infrastructure/`, single CDK stack):**

- Six `NodejsFunction`s (Node 22 on arm64, esbuild bundling), one per route. Each function has its own scoped IAM grant and KMS scope.
- `ExamItems` DynamoDB table with PK/SK and both GSIs (`SubjectStatusIndex`, `InverseIndex`). On-demand billing, encryption via a customer-managed KMS key with annual rotation.
- REST API Gateway with per-stage throttling, JSON access logs, `dataTraceEnabled: false` (so `correctAnswer` cannot reach CloudWatch), X-Ray active.
- Explicit `LogGroup`s with per-stage retention.
- Stage selection via `cdk.json` context: `cdk synth -c stage=dev|prod`. Both stages synth cleanly.

**Tests:**

- 15 tests across 6 files in `src/__tests__/`, one per handler, against the in-memory backend. A `resetStorage` fixture isolates state between tests so order doesn't matter.

What is *not* implemented in code by design — auth, edge protection, idempotency, PITR / deletion protection, alarms, CI/CD — is enumerated in Trade-offs and Future Work below.

## Data Model

Single table `ExamItems` with two GSIs.

| Key | Format | Purpose |
| --- | --- | --- |
| `PK` | `ITEM#<uuid>` | All rows for an item share a partition |
| `SK` | `CURRENT` or `VERSION#<zero-padded int>` | Distinguishes the live row from history |

Version SKs are zero-padded so lexicographic sort matches numeric order. The audit trail iterates newest-first via `ScanIndexForward: false`.

**GSIs:**

| Index | PK | SK | Use |
| --- | --- | --- | --- |
| `SubjectStatusIndex` | `subject` | `SK` | List items in a subject; KeyCondition pins `SK=CURRENT` |
| `InverseIndex` | `SK` | (none) | Global list of live items; KeyCondition pins `SK=CURRENT` |

Both project `ALL` so list responses come from the index without a follow-up `BatchGetItem`. The cost is replicating each item on every write that touches it. Worth it for an item-management workload where edits are infrequent.

**Item shape:**

```ts
{
  id: string;                  // UUID v4
  subject: string;             // "AP Biology", etc.
  itemType: string;            // multiple-choice | free-response | essay
  difficulty: number;          // 1-5
  content: {
    question: string;
    options?: string[];        // multiple-choice only, >= 2 entries
    correctAnswer: string;
    explanation: string;
  };
  metadata: {
    author: string;
    created: number;           // unix ms; server-set, immutable
    lastModified: number;      // unix ms; bumped on every write
    version: number;           // 1 on create, +1 per write
    status: string;            // draft | review | approved | archived
    tags: string[];
  };
  securityLevel: string;       // standard | secure | highly-secure
}
```

**Access patterns:**

| Pattern | Operation | Notes |
| --- | --- | --- |
| Create | `TransactWriteItems`: CURRENT + VERSION#1 | `attribute_not_exists(PK)` guards against duplicate id |
| Get by id | `GetItem` PK=ITEM#id, SK=CURRENT | Strongly consistent |
| Update | `GetItem` + `TransactWriteItems`: CURRENT + new VERSION | OCC on `metadata.version` |
| Create version (snapshot) | `GetItem` + `TransactWriteItems` | Same atomicity as update; no content change |
| List by subject | `Query` on `SubjectStatusIndex` | Status applied as FilterExpression |
| List all | `Query` on `InverseIndex` | Same pagination contract |
| Audit trail | `Query` PK=ITEM#id, SK begins_with VERSION# | Newest first; empty response -> 404 |

## API Surface

Six routes under `/api/items`. Every response is JSON; errors share one envelope:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "...", "details": [{ "path": "difficulty", "message": "..." }] } }
```

| Method | Path | Handler |
| --- | --- | --- |
| POST | `/api/items` | createItem |
| GET | `/api/items` | listItems |
| GET | `/api/items/:id` | getItem |
| PUT | `/api/items/:id` | updateItem |
| POST | `/api/items/:id/versions` | createVersion |
| GET | `/api/items/:id/audit` | getAuditTrail |

Validation runs at the handler boundary with Zod: UUID format on ids, enum membership for `itemType` / `status` / `securityLevel`, integer range on `difficulty` (1-5) and `limit` (1-100), and a cross-field rule that multiple-choice items have at least two options with `correctAnswer` in `options`. Failures return 400 with the structured `details` array above.

Pagination is token-based. `listItems` returns an opaque `nextToken` when more rows exist; the client passes it back as `?nextToken=...`. Total counts are not returned for DynamoDB because an honest count requires either a separate counter (write contention) or a Scan (linear cost).

## Infrastructure

CDK in TypeScript. One stack: `InfrastructureStack`. Stage selection is `cdk synth -c stage=dev|prod`, and per-stage settings live under `context.stages` in `cdk.json`.

| Service | Configuration |
| --- | --- |
| Lambda | Node.js 22 on arm64, 256 MB, 10 s timeout, X-Ray active, esbuild bundling |
| API Gateway | REST API, per-stage throttling, JSON access logs, no body trace |
| DynamoDB | On-demand, customer-managed KMS, two GSIs |
| CloudWatch | Per-stage retention (30 d dev, 180 d prod), structured logs |

REST was chosen over HTTP API because the likely next features (request validators, usage plans, WAF integration) are easier there.

Each route gets its own `NodejsFunction`. The cost (more constructs in the stack) is offset by per-function IAM and KMS scoping: read-only Lambdas get `kms:Decrypt` and `dynamodb:GetItem`/`Query`; the create-only Lambda gets `kms:Encrypt` and `dynamodb:TransactWriteItems`; update and createVersion get both. A compromised read handler cannot encrypt rogue payloads into the table.

The same `ItemStorage` interface backs both `MemoryStorage` (used by tests and `pnpm dev`) and `DynamoDBStorage` (used by deployed Lambdas). Handlers don't know which backend they're talking to, which keeps unit tests fast and AWS-free.

## Security

Authentication and authorization are out of scope for this submission. The API is open. The pieces that matter for an exam-content service are in place:

- `correctAnswer` never reaches logs. Handlers don't log full bodies, and API Gateway data-trace is off.
- Encryption at rest is a customer-managed KMS key with annual rotation, scoped per Lambda execution role.
- IAM grants are per-route. No `dynamodb:*` blanket statements.

Production additions:

- Auth: Cognito user pool authorizer for end users, or IAM auth for service-to-service callers.
- ABAC on `securityLevel`: a clearance claim on the caller's token, checked against the item's level. `highly-secure` items would warrant a separate CMK with a tighter key policy.
- Edge: CloudFront in front of API Gateway with a WAF web ACL (managed rule groups plus per-IP rate limiting). Disable the default API Gateway endpoint so all traffic goes through the edge.
- TLS 1.2+ enforced on the API Gateway stage.

## Scalability and Known Limits

- **Lambda** scales horizontally to the account default of 1,000 concurrent executions. Per-route isolation means a slow audit query can't starve the create path.
- **DynamoDB on-demand** absorbs bursts without pre-provisioning and stays at single-digit millisecond latency regardless of item count.
- **Hot partition on `InverseIndex`.** Every `CURRENT` row lands in one GSI partition because they all share `SK='CURRENT'`. At very high item counts or very high global-list read rates this becomes a single-partition bottleneck. The fix is write-sharding: synthesize a partition key like `CURRENT#<0..N>` with N = `hash(itemId) % shardCount` and scatter-gather across N shards on read. Worth doing once a hot-partition metric trips, not before.
- **Write amplification.** Every create or update writes the CURRENT row plus a new VERSION snapshot in one transaction. Doubles write cost; that is the price of an atomic audit trail.
- **Cold starts.** Node 22 on arm64 with esbuild bundling is typically under 200 ms. If `getItem` p99 latency becomes a UX problem, Provisioned Concurrency is the lever.

## Trade-offs and Future Work

Optimized for: clean separation between handler logic and Lambda glue, atomic versioning, per-route IAM and KMS scoping, and a single-table schema that supports the listed access patterns without scans.

What I would add with more time:

| Area | Today | Next |
| --- | --- | --- |
| Auth | None | Cognito user pool or IAM auth, ABAC on `securityLevel` |
| Data durability | Removal policy set per stage | PITR enabled and `deletionProtection` on the prod stack |
| Edge | None | CloudFront + WAF; disable default API Gateway endpoint |
| Observability | Structured logs + X-Ray | CloudWatch alarms (Lambda errors, DDB throttles, 5xx), EMF custom metrics, request-id propagation |
| Idempotency | None | `Idempotency-Key` header on `POST /api/items` via Lambda Powertools |
| CI/CD | Manual `cdk deploy` | GitHub Actions: `pnpm test`, `cdk synth`, staging then prod with manual approval |
| Stacks | Single | Split `DataStack` and `ApiStack` so the table outlives an API rewrite |
| Pagination tokens | Opaque base64url | Sign or encrypt so the internal key shape isn't leaked to clients |
| Tests | Handler-level against in-memory storage | Integration tests against DynamoDB Local; load tests on hot endpoints |

Two design choices worth flagging:

1. **Full snapshots over delta-encoded versions.** Storage is cheap at exam-item size (kB per item, low version counts) and the audit trail stays trivially queryable. Recovering an arbitrary historical state is one `GetItem`, not N applied diffs.
2. **`TransactWriteItems` instead of two sequential `PutItems`.** Adds a bit of latency, but the audit trail is a correctness surface and half-written history would be hard to reason about after the fact.

### On scope and time

The README recommends focusing on 2-3 endpoints, and the commit history shows that was the original plan — handlers landed one at a time with a planned stop at three. I kept going to ship all six, which pushed total time past the 3-hour budget. The overrun also covered finalizing the CDK stack and moving my handwritten architecture notes into this document. Lesson for next time: take the "2-3 endpoints" guidance literally and spend the saved budget on the trade-off depth and test coverage the rubric weights more heavily than endpoint count.

### On AI assistance

Claude was used as a writing assistant for this document to move my handwritten architecture notes into a tighter, more skimmable shape under time pressure. The research, design decisions, and trade-off reasoning are mine — Claude was the typist, not the architect.

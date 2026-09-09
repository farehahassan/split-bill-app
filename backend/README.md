# Hisab Backend

REST API for the Hisab split-bill application. Built with TypeScript, Node.js, Express, and PostgreSQL.

## Stack

- **Runtime:** Node.js >= 18
- **Language:** TypeScript (strict mode)
- **Framework:** Express.js v4
- **ORM:** Prisma
- **Database:** PostgreSQL
- **Validation:** Zod
- **Testing:** Vitest + Supertest
- **Linting:** ESLint + Prettier
- **API Documentation:** OpenAPI 3.0.3 (self-hosted Swagger UI via `swagger-ui-dist`)

## Directory Structure

```
backend/
├── prisma/
│   ├── schema.prisma             # Prisma schema (PostgreSQL, all entities)
│   └── migrations/               # Version-controlled migration files
├── src/
│   ├── config/
│   │   └── env.ts                # Zod-validated environment config
│   ├── constants/
│   │   ├── app-errors.ts         # Application error code names
│   │   └── http-statuses.ts      # HTTP status code enum (meaningful names)
│   ├── db/
│   │   └── prisma.ts             # Centralized Prisma client & DB utilities
│   ├── edge/                     # In-process application gateway/edge layer
│   │   ├── index.ts              # Installs trust proxy + request guard
│   │   ├── requestGuard.ts       # URL hygiene, body-size pre-check, request-ID normalization
│   │   └── trustProxy.ts         # TRUST_PROXY parsing (req.ip resolution)
│   ├── errors/
│   │   └── app.error.ts          # Base AppError + specialized error classes
│   ├── docs/                     # OpenAPI 3.0.3 specification + self-hosted Swagger UI
│   │   ├── openapi.types.ts      # Typed OpenAPI 3.0.x document shapes
│   │   ├── helpers.ts            # Envelope/response/$ref helpers
│   │   ├── components/           # Reusable schemas, responses, parameters, security
│   │   ├── paths/                # One file per path-group (health, auth, groups, ...)
│   │   ├── openapi.ts            # Document assembly (create/get with module cache)
│   │   ├── docs.routes.ts        # /api/docs UI, /openapi.json, asset + initializer serving
│   │   └── index.ts              # Public exports for the docs module
│   ├── middleware/
│   │   ├── authenticate.ts       # JWT bearer-token auth for protected routes
│   │   ├── errorHandler.ts       # Centralized error handling + 404
│   │   ├── rateLimiter.ts        # API rate limiting (general + auth tiers)
│   │   └── validate.ts           # Zod validation middleware
│   ├── metrics/                  # Prometheus text-format metrics (registry, HTTP metrics, routes)
│   ├── redis/                    # Redis infrastructure (infra, no domain logic)
│   │   ├── redisClient.ts        # Lazy ioredis client, connect/disconnect, RedisLike contract
│   │   ├── rateLimitStore.ts     # Redis-backed express-rate-limit store (Lua fixed window)
│   │   ├── distributedLock.ts    # TTL-bounded distributed lock (SET NX PX + Lua release)
│   │   └── cacheStore.ts         # Generic string cache primitive (get/set+TTL/delete, no policy)
│   ├── queues/                   # Background job queue infrastructure (infra, no domain logic)
│   │   ├── job.types.ts          # JOB_TYPES allowlist + JobEnvelope shape
│   │   ├── jobQueue.ts           # Step-by-step Redis queue: enqueue/claim/complete/retry/discard
│   │   ├── jobRegistry.ts        # Explicit job-type → {schema, process} dispatch registry
│   │   └── workerRunner.ts       # Poll loop + lease/dispatch/backoff lifecycle per job
│   ├── modules/
│   │   ├── auth/                 # Authentication feature module
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.repository.ts
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.service.ts
│   │   │   └── validators.ts
│   │   ├── summary/              # Group summary snapshots (computed by the worker)
│   │   │   ├── summary.controller.ts
│   │   │   ├── summary.jobs.ts   # GROUP_SUMMARY_RECOMPUTE handler + payload schema
│   │   │   ├── summary.repository.ts
│   │   │   ├── summary.routes.ts
│   │   │   ├── summary.service.ts
│   │   │   └── summary.validators.ts
│   │   └── groups/               # Groups & membership feature module
│   │       ├── group.cache.ts    # Cache-aside adapter (key, TTL, serialize, safe degrade)
│   │       ├── group.controller.ts
│   │       ├── group.repository.ts
│   │       ├── group.routes.ts
│   │       ├── group.service.ts
│   │       └── validators.ts
│   │   └── expenses/              # Expenses & split calculation feature module
│   │       ├── expense.controller.ts
│   │       ├── expense.repository.ts
│   │       ├── expense.routes.ts
│   │       ├── expense.service.ts
│   │       ├── split.util.ts      # Pure EQUAL/EXACT split calculation helpers
│   │       └── validators.ts
│   │   └── settlements/           # Balance calculation & settlement feature module
│   │       ├── balance.util.ts    # Pure BIGINT balance calculation helpers
│   │       ├── settlement.controller.ts
│   │       ├── settlement.repository.ts
│   │       ├── settlement.routes.ts
│   │       ├── settlement.service.ts
│   │       └── validators.ts
│   │   ├── idempotency/           # Idempotency protection for financial operations
│   │       ├── validate.ts        # Idempotency-Key header validation middleware
│   │       ├── reconcile.ts       # Idempotency record state reconciliation
│   │       ├── request-hash.ts    # Deterministic SHA-256 request fingerprint
│   │       └── idempotency.constants.ts
│   │   └── activity/              # Activity feed & audit event feature module
│   │       ├── activity.controller.ts
│   │       ├── activity.repository.ts
│   │       ├── activity.service.ts
│   │       └── validators.ts
│   ├── routes/
│   │   ├── health.ts             # GET /health, GET /health/ready
│   │   ├── index.ts              # /api/v1 router
│   │   └── v1/index.ts           # Mounts feature modules (auth, groups, expenses, settlements, ...)
│   ├── types/
│   │   └── index.ts              # Shared TypeScript types
│   ├── utils/
│   │   ├── asyncHandler.ts       # Wraps async controllers to forward errors
│   │   ├── logger.ts             # Lightweight structured JSON logger
│   │   └── requestId.ts          # Shared X-Request-Id validation rules (edge + middleware)
│   ├── app.ts                    # Express application (testable standalone)
│   ├── server.ts                 # Server startup: DB connect + graceful shutdown
│   └── worker.ts                 # Worker startup: DB + Redis connect, queue poll loop (fatal on Redis outage)
├── tests/
│   ├── setup.ts                  # Test setup (env config, silent logger)
│   ├── app.test.ts               # Application + health + 404 tests
│   ├── auth.api.test.ts          # Auth endpoint integration tests (mocked DB)
│   ├── auth.service.test.ts      # Auth service unit tests (mocked repository)
│   ├── groups.api.test.ts        # Group endpoint integration tests (mocked DB)
│   ├── groups.service.test.ts    # Group service unit tests (mocked repository)
│   ├── group.cache.test.ts       # Group cache adapter tests (round-trip, TTL, validation, degrade)
│   ├── groups.cache.service.test.ts # Group service cache-aside behavior (hit/miss/authz/invalidation)
│   ├── groups.cache.api.test.ts  # Group caching endpoint tests (hit/miss, 403-on-hit, invalidation)
│   ├── expenses.api.test.ts      # Expense endpoint integration tests (mocked DB)
│   ├── expenses.service.test.ts  # Expense service unit tests (mocked repository)
│   ├── split.util.test.ts        # Split calculation unit tests
│   ├── settlement.api.test.ts    # Balance & settlement endpoint integration tests (mocked DB)
│   ├── settlement.service.test.ts# Balance & settlement service unit tests (mocked repository)
│   ├── settlement.repository.test.ts # Settlement idempotency transaction tests (mocked DB)
│   ├── idempotency.test.ts        # Request-hash and reconciliation unit tests
│   ├── activity.api.test.ts      # Activity endpoint integration tests (mocked DB)
│   ├── activity.service.test.ts  # Activity service unit tests (mocked repository)
│   ├── activity.creation.test.ts # Activity event creation tests (mocked repositories)
│   ├── activity.transaction.test.ts # Activity transactional-consistency tests (mocked DB)
│   ├── balance.util.test.ts      # Balance calculation unit tests
│   ├── config.test.ts            # Configuration validation tests
│   ├── errors.test.ts            # Error class unit tests
│   ├── asyncHandler.test.ts      # Async handler middleware tests
│   ├── health.test.ts            # Readiness endpoint tests (mocked DB)
│   ├── docs.api.test.ts          # /api/docs routes + documented-route parity tests
│   ├── openapi.document.test.ts  # OpenAPI spec validation ($ref, security, contracts)
│   └── middleware.test.ts        # Validation middleware tests
│   └── rate-limit.test.ts        # Rate limiting tests (envelope, headers, window reset, per-IP isolation)
│   └── rate-limit.redis.test.ts  # Redis-backed rate limiting tests (shared state, fail-open, prefixes)
│   └── cache-store.test.ts       # Generic cache store tests (round-trip, TTL conversion, propagation)
│   └── distributed-lock.test.ts  # Distributed lock unit tests (token, TTL, release, degraded paths)
│   └── queue.test.ts             # Job queue unit tests (enqueue, claim/lease, retry/backoff, discard)
│   └── workerRunner.test.ts      # Worker poll-loop tests (dispatch, validation, retries, graceful stop)
│   └── summary.jobs.test.ts      # Summary job handler tests (recompute, permanent failure)
│   └── summary.service.test.ts   # Summary service tests (authorization, enqueue, 500-on-queue-failure)
│   └── summary.repository.test.ts# Summary repository tests (aggregation, upsert, lookups)
│   └── summary.api.test.ts       # Group summary endpoint integration tests (202, 403, 404, 500)
│   └── settlement.lock.test.ts   # Settlement creation under the lock (409 conflict, degrade, success)
│   └── edge.test.ts              # Edge layer tests (trust proxy, URL/body/request-ID guard, 413)
│   └── helpers/
│       └── fakeRedis.ts          # In-memory + failing Redis fakes for tests
├── .env.example
├── .gitignore
├── eslint.config.js
├── prettier.config.js
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## Prerequisites

- Node.js >= 18
- PostgreSQL (required for database features and migrations)
- Redis (optional for the API server; **required** for distributed rate
  limiting/locking and for the background worker process)
- npm

## Installation

```bash
cd backend
npm install
```

## Environment Configuration

Copy `.env.example` to `.env` and configure. **Never commit your `.env` file or real PostgreSQL credentials.**

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | `development`, `production`, or `test` |
| `PORT` | No | `3000` | HTTP server port |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string (format: `postgresql://user:password@host:port/dbname`) |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed CORS origin |
| `JWT_SECRET` | Yes | — | Secret used to sign JSON Web Tokens. Generate a strong random value and never commit it. |
| `JWT_EXPIRES_IN` | No | `7d` | Access token lifetime (e.g. `7d`, `1h`) |
| `REFRESH_TOKEN_TTL_DAYS` | No | `30` | Refresh-token session lifetime in days |
| `RATE_LIMIT_WINDOW_MS` | No | `900000` | Rate-limit window length in milliseconds (15 minutes) |
| `RATE_LIMIT_MAX` | No | `100` | Max requests per client IP per window for non-auth endpoints |
| `AUTH_RATE_LIMIT_MAX` | No | `20` | Max requests per client IP per window for `/api/v1/auth/*` |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection string for distributed rate limiting/locking. Never commit one containing a password. |
| `TRUST_PROXY` | No | `false` | Reverse-proxy trust level for `req.ip`. Use `true`/`1` (first hop), a hop count, or an Express value (`loopback`, subnet, ...). Leave `false` when no proxy is deployed. |
| `DISTRIBUTED_LOCK_TTL_MS` | No | `10000` | TTL of distributed locks in milliseconds. Must exceed the longest protected operation. |
| `JOB_QUEUE_MAX_ATTEMPTS` | No | `5` | Retry budget for background jobs before they are discarded. |
| `JOB_QUEUE_BASE_BACKOFF_MS` | No | `2000` | First-retry delay for a failed background job (exponential). |
| `JOB_QUEUE_MAX_BACKOFF_MS` | No | `60000` | Cap on a single job's retry delay. |
| `JOB_QUEUE_LEASE_MS` | No | `30000` | In-flight lease length for a claimed job; must exceed the longest job. |
| `JOB_QUEUE_PAYLOAD_TTL_MS` | No | `86400000` | TTL of a queued job payload; must exceed the full retry horizon. |
| `JOB_QUEUE_POLL_INTERVAL_MS` | No | `100` | Idle poll interval of the worker process. |
| `CACHE_GROUP_TTL_SECONDS` | No | `300` | TTL of cached group details. Group data is relatively stable and every mutating group operation invalidates the entry, so this is the *safety-net cap* for missed invalidations, not the freshness guarantee. |
| `METRICS_ENABLED` | No | `true` | When `true`, the API exposes aggregate metrics at `GET /metrics` in Prometheus text format. Set `false` to disable (e.g. behind a shared edge). |
| `METRICS_PORT` | No | — | Optional port number for the background worker's metrics scrape listener. The worker has no HTTP server of its own; leave unset to disable. |

### Setting Up Your Local Database

1. Create a PostgreSQL database (the name in `DATABASE_URL` must exist):

   ```sql
   CREATE DATABASE splitease;
   ```

2. Copy `.env.example` to `.env` and replace the `DATABASE_URL` with your real local PostgreSQL credentials.

3. Run migrations to create the schema:

   ```bash
   npm run db:migrate:dev
   ```

4. Generate the Prisma Client:

   ```bash
   npm run db:generate
   ```

## Available Scripts

```bash
npm run dev              # Start development server with hot-reload
npm run worker           # Start the background worker (tsx, development)
npm run build            # Compile TypeScript to dist/
npm start                # Run compiled server from dist/
npm run start:worker     # Run compiled worker from dist/
npm test                 # Run test suite (Vitest)
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage
npm run lint             # Run ESLint
npm run lint:fix         # Run ESLint with auto-fix
npm run format           # Format code with Prettier
npm run format:check     # Check formatting without modifying
npm run typecheck        # Type-check without emitting
npm run db:generate      # Generate Prisma Client from schema
npm run db:migrate       # Apply pending migrations (production/deploy)
npm run db:migrate:dev   # Create/apply migrations (development)
npm run db:studio        # Open Prisma Studio (GUI for data inspection)
npm run db:validate      # Validate the Prisma schema
```

## Health Endpoints

```
GET /health
```
Liveness check. Always returns 200 if the server is running (no DB required).

```json
{ "status": "ok" }
```

```
GET /health/ready
```
Readiness check. Verifies database connectivity.

- `200 { "status": "ready" }` — database is reachable
- `503 { "status": "unavailable", "message": "Service is not ready yet." }` — database is unreachable

## API Documentation (OpenAPI & Swagger UI)

The backend ships a complete, hand-maintained **OpenAPI 3.0.3** specification of
the public API and serves it through an interactive Swagger UI. Everything is
self-hosted by the backend process — no CDN, no third-party dashboard, and no
loosened security headers:

- **`GET /api/docs`** — interactive Swagger UI for exploring and trying every endpoint
- **`GET /api/docs/openapi.json`** — the raw OpenAPI document as JSON (versioned with the API)

The specification lives under `src/docs/` as a typed, modular OpenAPI document:
reusable schemas/responses/parameters/security schemes in `components/`, one
file per path-group in `paths/`, assembled by `openapi.ts` and mounted at
`/api/docs` in `app.ts`. The Swagger UI assets come from `swagger-ui-dist`
(served at `/api/docs/assets/`), and the app initializer is an external file
(`/api/docs/swagger-initializer.js`) — there are no inline scripts, so the
Helmet Content-Security-Policy is never relaxed.

The document is validated by the test suite rather than left to drift:

- `tests/openapi.document.test.ts` — metadata, expected path list, unique
  `operationId`s, `in: path` parameter declarations for every `{variable}`, the
  idempotency header, pagination parameters, and that **every `$ref` resolves**.
- `tests/docs.api.test.ts` — `/api/docs` routes serve parseable, stable output,
  every documented operation exists in the running Express app and enforces the
  documented auth contract (401 for protected, 400/200/503 for public), and every
  Express route that is not API-documentation infrastructure is covered by the
  spec.

Key conventions encoded in the specification:

- Success responses use the envelope `{ "success": true, "data": ... }`; errors
  use `{ "success": false, "message": "...", "errors": [...] }`.
- All monetary amounts are **integers in minor units** — no floats are used for
  money anywhere in the API surface.
- `/api/v1` routes require `Authorization: Bearer <jwt>`; only
  register/login/refresh/logout and the health/metrics probes are public.
- `POST /api/v1/groups/{id}/settlements` requires an `Idempotency-Key` header
  (8–128 chars, letters/digits/`_`/`-`/`.`).

## Request Tracing

Every HTTP request receives a **request/correlation ID** so calls can be traced
through logs and matched to responses.

- Each response includes the header:

  ```
  X-Request-Id: <request-id>
  ```

- When the client does **not** send an `X-Request-Id`, the server generates a
  cryptographically strong **UUID v4** and returns it in the response header.
- A client may supply its own safe tracing ID (≤128 characters, containing only
  letters, digits, `-`, `_`, and `.`) via the `X-Request-Id` header; it is echoed
  back when valid. Oversized, malformed, or control-character values are rejected
  and replaced with a newly generated UUID.
- The ID is attached to every request as `req.requestId` and is included in
  centralized request-completion logs (`requestId`, `method`, `path`, `route`,
  `statusCode`, `durationMs`), where `route` is the normalized route template
  (e.g. `/api/v1/groups/:id`) rather than a raw URL.
- Request IDs are **tracing identifiers only** — they are never used for
  authentication or authorization, and they are present (via the response header)
  on success and error responses alike, including 401/403/404/500 flows.
- Request-completion logging never includes authorization headers, tokens,
  cookies, request/response bodies, or other sensitive data.

## Error Handling

All errors are returned in a consistent format:

```json
{
  "success": false,
  "message": "Human-readable error description"
}
```

Validation errors include field-level detail:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "Invalid email" }
  ]
}
```

Internal stack traces are never exposed in production responses.

HTTP status codes use the `HTTP_STATUSES` enum (`src/constants/http-statuses.ts`) for self-documenting, maintainable code.

## Rate Limiting

All `/api/v1` requests are rate-limited per client IP to protect the API against
abuse (brute-force login attempts, scraping, and runaway clients). Implemented
with `express-rate-limit` in `src/middleware/rateLimiter.ts`.

Two tiers with independent counters:

| Tier | Mount | Default limit per window |
|---|---|---|
| General | all `/api/v1` endpoints | `RATE_LIMIT_MAX` (100) |
| Auth | `/api/v1/auth/*` | `AUTH_RATE_LIMIT_MAX` (20) |

The window length is controlled by `RATE_LIMIT_WINDOW_MS` (default `900000` ms =
15 minutes). Auth routes first pass the global limiter and then the stricter auth
limiter, so they are subject to both counters.

- Exceeding the limit returns **HTTP 429** with the standard API error envelope:
  `{ "success": false, "message": "Too many requests" }` and a `Retry-After`
  header.
- Responses include standard `RateLimit-*` headers (`RateLimit-Policy`,
  `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`) so clients can
  honor the limits proactively.
- The default store is **in-memory and process-local** (`MemoryStore`), used when
  Redis is not connected. With a connected Redis (`REDIS_URL`), a **Redis-backed
  store** (`src/redis/rateLimitStore.ts`) shares counters across every server
  instance (true distributed protection). The store runs a fixed window anchored
  on the first hit and stores counters under `rl:api:`/`rl:auth:` prefixes so the
  two tiers never collide.
- **Fail-open policy**: if Redis is down, rate limiting degrades to "allow" in
  the same way the library's in-memory behavior works — the API stays up, the
  failure is logged, and per-instance enforcement is lost until Redis recovers.
  Attackers could bypass limits during an outage; availability is deliberately
  preferred over enforcement.
- The client identity is `req.ip`. `X-Forwarded-For` is only trusted when
  `TRUST_PROXY` is set (see [Edge Layer / Gateway](#edge-layer--gateway)); the
  app-level `trust proxy` setting derives from it. Leave it `false` when no
  reverse proxy is deployed.
- The limiter makes **no database queries**, so a target cannot bypass limits by
  hammering the database, and it never races against idempotency.
- Limits are configurable via environment variables, see
  [Environment Configuration](#environment-configuration).

## Redis Infrastructure

Redis supports four cross-instance concerns: distributed rate limiting,
distributed locking, the background job queue, and cache-aside caching. It is
optional at runtime for the **API server** — if Redis is unreachable the server
degrades (in-memory rate limiting, uncoordinated locks, cache reads fall back to
the database) and stays up — but it is **required** by the **worker process**,
which cannot move jobs without a queue transport. Redis is accessed only through
the narrow `RedisLike` contract in `src/redis/redisClient.ts` (a single lazy
ioredis client, created with `enableOfflineQueue: false` so commands fail fast
instead of queueing), so tests can inject an in-memory fake — the test suite
runs without a live Redis server.

- `connectRedis()` runs at startup and is **non-fatal for the API server**: if
  Redis is unreachable the server keeps serving with degraded behavior
  (in-memory rate limiting, uncoordinated locks) and every degradation is
  logged. The worker treats a failed Redis connect as **fatal**.
- The client handles connection errors and auto-reconnect internally; the
  connection string itself is never logged because it may embed credentials.

## Distributed Locking

`src/redis/distributedLock.ts` provides a single-instance, TTL-bounded
distributed lock used to serialize genuinely concurrent operations across
instances. Acquisition uses the atomic `SET key token NX PX ttl` primitive with
a unique ownership token per holder; release runs a Lua script that only deletes
the key when the token still matches, so one holder can never release another's
lock.

Policy:

- **Lock held by another process** → HTTP 409 with the error code
  `SETTLEMENT_CONCURRENT_LOCKED` (`ConflictError`); the caller is told to retry
  shortly instead of queueing.
- **Redis unavailable / error while acquiring** → the operation runs *without*
  coordination and a warning is logged. The lock is a coordination hint, not a
  correctness barrier: the database transaction and the idempotency layer remain
  authoritative, and the lock never claims to be held when it is not.
- **Release failure** → logged; the TTL is the backstop, so a crashed holder can
  never deadlock the resource.
- Every lock has a TTL (`DISTRIBUTED_LOCK_TTL_MS`, default 10s) that must
  comfortably exceed the longest protected operation.

Currently applied to **settlement creation** with the group-scoped key
`lock:settlement:group:{groupId}`: concurrent settlements in the same group (one
shared balance book) are serialized and made deterministic, while settlements in
different groups never contend.

## Background Job Queue & Worker

Long-running, non-CRITICAL work runs in a separate **worker process**
(`src/worker.ts`, started with `npm run worker`) against a Redis-backed queue.
The API server enqueues jobs and returns immediately; the worker claims them off
the queue and performs the work against PostgreSQL.

Infrastructure lives in `src/queues/`:

- `job.types.ts` — the `JOB_TYPES` allowlist and the `JobEnvelope` wire shape.
  Type strings are never built from user input; the worker dispatches through a
  static registry keyed by this union.
- `jobQueue.ts` — the queue primitive. Enqueuing writes the serialized envelope
  under `job:data:{jobId}` (with a TTL) and inserts `jobId` into the sorted set
  `job:queue:{type}` scored by the next-attempt timestamp. Claiming runs a Lua
  script that reads the earliest due member (`ZRANGEBYSCORE -inf <now> LIMIT 0 1`)
  and only succeeds once the claimant holds the in-flight lease
  `job:inflight:{jobId}` (`SET ... NX PX`). The member stays in the sorted set
  until the job completes, is discarded, or its payload expires.
- `jobRegistry.ts` — the explicit `Record<JobType, JobRegistration>` mapping
  each type to its Zod payload schema and `process` handler. TypeScript enforces
  that every declared type has a handler.
- `workerRunner.ts` — the poll loop. Each tick polls every registered type,
  validates payloads with the registration's Zod schema **before** running any
  domain code, and executes the handler.

Delivery is **at-least-once**:

- **Success** → the job is `complete()`d (removed from the sorted set, payload,
  and lease).
- **Transient failure** (handler throws) → the failed attempt count is
  incremented on the payload and the member is re-scored to
  `now + backoff`, where backoff grows `base × 2^(n-1)` up to
  `maxBackoffMs`. When the attempt budget (`maxAttempts`) is exhausted the job
  is discarded.
- **Permanent failure** (`PermanentJobFailureError`) → discarded immediately
  (used, for example, when the target resource no longer exists).
- **Malformed queued member** → the lease and payload are cleaned up and the
  member is discarded with a warning; the poll loop keeps running.
- **Worker crash mid-job** → the member remains in the sorted set; once the
  in-flight lease (`leaseMs`) expires, another worker reclaims and retries it.

Handlers must therefore be idempotent. The current workload, group summary
recomputation, satisfies this by upserting a single `GroupSummary` row keyed on
the unique `groupId`.

The worker connects to the database and Redis at startup and **fails fast** if
either is unavailable (unlike the API server, it has no degraded mode). On
`SIGINT`/`SIGTERM` it stops polling, waits for the currently in-flight job to
finish, then disconnects cleanly. Jobs carry the enqueuing request's
`requestId` in their envelope so worker logs correlate back to the HTTP request
that queued them. Only allowed job payloads, which carry no secrets or tokens,
are ever stored in Redis.

## Redis Caching

Frequently-read, relatively stable reads are cached in Redis with the
**cache-aside** pattern. PostgreSQL remains the authoritative source of truth;
Redis is purely a performance layer. Every cache entry has a TTL, every affected
write invalidates its entries, and a Redis outage only costs performance, never
correctness.

### Selected cached resource

`GET /api/v1/groups/:id` (**group details with members**). It is the best fit
among the current reads: it is hit frequently (group detail views), returns a
relatively stable payload (name, owner, membership list — membership only
changes through owner-only operations), and is not user-scoped, so one
group-keyed entry serves every authenticated member.

### Cache-aside flow

```
Request → authenticate → membership/ownership authorize
  → service cache lookup
      ├─ HIT → membership check → response (no PostgreSQL group query)
      └─ MISS → repository (PostgreSQL) → membership check
            → store result in Redis (with TTL) → response
```

The **first authorized read populates the cache**; subsequent reads are served
from Redis until the entry is invalidated or its TTL expires. The response
envelope is identical on hit and miss — caching is an internal implementation
detail and never exposed to clients.

### Cache key strategy

Keys follow the existing namespaced convention `concern:resource:{id}` (compare
`lock:settlement:group:{groupId}`):

```
cache:group:{groupId}
```

- `cache:` keeps cache entries isolated from the `rl:`/`lock:`/`job:` keyspaces.
- `group:` names the resource type so different cached resources can never
  collide under the same id.
- The id is the validated non-empty path parameter; keys are only ever built
  from the fixed `groupCacheKey()` template, never from arbitrary user input.

### TTL strategy

Every entry expires via `CACHE_GROUP_TTL_SECONDS` (default **300 s / 5 min**),
configured centrally in the environment schema and `GroupCache`. The TTL is a
**safety net, not the freshness mechanism**: because every mutating group
operation invalidates the entry, the normal staleness window is ~zero. The TTL
guards against missed invalidations (e.g. a process that crashed between the
DB write and the cache delete) and bounds memory. No permanent cache entries
exist anywhere.

### Cache invalidation

Invalidation runs **after the successful database write** that changes the
group detail, close to the domain operation that owns the change:

- `PUT /groups/:id` (rename) → invalidate `cache:group:{id}`
- `DELETE /groups/:id` → invalidate `cache:group:{id}`
- `POST /groups/:id/members` (add) → invalidate `cache:group:{id}`
- `DELETE /groups/:id/members/:memberId` (remove) → invalidate `cache:group:{id}`

Only the affected group's key is ever deleted; unrelated entries are untouched.
Writes never depend on caching succeeding: the database transaction commits
first and then invalidation runs best-effort.

### Redis failure behavior

Caching is an optimization, never a dependency:

- **Read failure** → logged (`cache operation`, resource type/id; never payloads)
  and treated as a cache miss — the request is served from PostgreSQL.
- **Write (populate) failure** → logged; the authoritative database result is
  returned normally.
- **Invalidation failure** → logged with a warning that stale data may be served
  until the TTL expires.
- Raw Redis errors are never exposed to clients, and no cached payload (group
  names or member names/emails) is ever written to logs.

### Authorization and security

A cache hit can **never bypass authorization**:

```
authenticate → cache lookup → membership check → response
```

The group detail is only returned to members; the membership check
(`isGroupMember`) always runs against PostgreSQL, on hit and miss alike. Cache
entries are **group-scoped, not user-scoped**, so one entry cannot leak data
across authorization boundaries — a non-member's request still ends in HTTP 403
even when a warm cache entry exists, and non-member misses never populate the
cache. Only the same fields the endpoint already returns to members
(name, owner, members' names/emails) are stored: never passwords, tokens,
refresh tokens, Authorization headers, database credentials, or request bodies.

### Cache stampede strategy

A stampede (N concurrent misses after expiry all hitting PostgreSQL at once) is
**deliberately not lock-guarded**. The existing distributed lock is for write
serialization, and lock-based read population is not justified here: the cached
query is a single indexed lookup with a short TTL, and a burst of coincident
misses resolves itself within one TTL epoch. The small, self-bounding window is
accepted and documented rather than adding lock round-trips to every miss.

## Edge Layer / Gateway

The project deploys a plain Node/Express process (no reverse proxy or container
orchestration exists in the repo), so the gateway is an **in-process
application edge** installed before every other middleware (`src/edge/`). It:

- Configures Express `trust proxy` from `TRUST_PROXY` so `req.ip` (and therefore
  per-IP rate limiting) resolves through a reverse proxy only when an operator
  declares one.
- Screens every request **before** rate limiting and body parsing: rejects URLs
  with control characters and absurdly long URLs, and rejects requests whose
  declared `Content-Length` exceeds the 10 MB body limit ahead of time with
  HTTP 413.
- Normalizes the incoming `X-Request-Id` header using the same rule as the
  request-ID middleware (`utils/requestId.ts` is the single source of truth):
  well-formed IDs pass through, poorly formed IDs are dropped so the ID
  middleware issues a fresh UUID — preserving the app's resilient
  sanitize-and-fallback tracing contract while keeping malformed characters out
  of logs.

The edge layer contains no business logic and performs no I/O beyond reading
headers. Rate limiting runs in the normal backend middleware graph (the gateway
does not double-rate-limit). In a future deployment one can still front the app
with an external load balancer / reverse proxy and set `TRUST_PROXY`
accordingly; nothing about the edge layer conflicts with that.

## API Structure

All feature endpoints are mounted under `/api/v1`:

- `/api/v1/auth` — Authentication (register, login, refresh, logout, current user, email verification, password recovery)
- `/api/v1/groups` — Group management & membership
- `/api/v1/expenses` — Expense tracking & split calculation
- `/api/v1/settlements` — Settlement recording & balance calculation
- `/api/v1/groups/:groupId/activity` — Group activity feed & audit events
- `/api/v1/groups/:groupId/summary` — Group summary snapshot (read) & recompute (async job)

## Authentication API

Authentication endpoints live under `/api/v1/auth`.

### POST /api/v1/auth/register

Registers a new user and returns an access token plus a refresh token.

Request body:

```json
{
  "name": "Ahmed Raza",
  "email": "ahmed@example.com",
  "password": "password123"
}
```

- `name` — required, non-empty string
- `email` — required, valid email
- `password` — required, at least 8 characters

- `201` — user created; returns `{ success, data: { user, token, refreshToken } }`
- `409` — an account with this email already exists
- `400` — validation failed

Response (201):

```json
{
  "success": true,
  "data": {
    "user": { "id": "<uuid>", "name": "Ahmed Raza", "email": "ahmed@example.com" },
    "token": "<jwt>",
    "refreshToken": "<opaque-refresh-token>"
  }
}
```

> The user object never includes `passwordHash` or `password`. Passwords are
> hashed with **bcrypt** (12 rounds) before storage. The refresh token is only
> returned once — only its SHA-256 hash is persisted.

### POST /api/v1/auth/login

Signs in an existing user and returns an access token plus a refresh token.

Request body:

```json
{
  "email": "ahmed@example.com",
  "password": "password123"
}
```

- `200` — success; returns `{ success, data: { user, token, refreshToken } }`
- `401` — invalid email or password
- `400` — validation failed

### POST /api/v1/auth/refresh

Exchanges a valid refresh token for a new access token and a rotated refresh
token in a single atomic session rotation. The presented refresh token is
immediately revoked.

Request body:

```json
{
  "refreshToken": "<opaque-refresh-token>"
}
```

- `200` — success; returns `{ success, data: { user, token, refreshToken } }`
- `400` — missing, empty, or unexpected fields
- `401` — invalid, expired, revoked, or already-rotated refresh token

> Authentication failures use a single generic `REFRESH_TOKEN_INVALID` code so
> the response never reveals whether a specific refresh-token record exists.
> Reusing a rotated/revoked token is rejected; sessions are rotated atomically.

### POST /api/v1/auth/logout

Revokes the session identified by the presented refresh token. Idempotent:
calling logout with an unknown, expired, or already-revoked token still returns
success and changes nothing.

Request body:

```json
{
  "refreshToken": "<opaque-refresh-token>"
}
```

- `200` — success; returns `{ success, data: { message } }`
- `400` — missing, empty, or unexpected fields

> Logout revokes only the session whose refresh token is presented. It never
> accepts a user id, so one user's session cannot be revoked without holding its
> own refresh credential.

### GET /api/v1/auth/me

Returns the currently authenticated user. Requires a `Bearer` token.

Request header:

```
Authorization: Bearer <jwt>
```

- `200` — success; returns `{ success, data: { user } }`
- `401` — missing, malformed, invalid, or expired token
- `404` — the authenticated user no longer exists

### PATCH /api/v1/auth/me

Updates the authenticated user's public profile. Requires a `Bearer` token.
At least one of `name` or `email` is required; both may be supplied. The email
is validated and must not be in use by another account. Privileged fields
(e.g. `password` or `role`) are rejected outright. The response is the updated
profile and never includes the password hash.

Request body:

```json
{
  "name": "Ahmed Raza",
  "email": "ahmed@example.com"
}
```

- `200` — success; returns `{ success, data: { user } }`
- `400` — validation failed (including an empty body)
- `401` — missing, malformed, invalid, or expired token
- `404` — the authenticated user no longer exists
- `409` — the email is already in use by another account

### Email verification and password recovery

All four endpoints are public and accept JSON bodies. Email delivery is
**best-effort**: a temporary SMTP failure does not fail the request (an
`EmailDeliveryError` is logged and the account/request still succeeds), and the
sender can simply request the email again. When `EMAIL_ENABLED=false` (the
default) no SMTP connection is attempted and the email is written to the log
transport instead.

#### POST /api/v1/auth/verify-email

Confirms a user's email address with the single-use token from the verification
email. A token can be used exactly once and expires after
`EMAIL_VERIFICATION_TOKEN_TTL_MINUTES` (default 24 hours).

```json
{ "token": "<verification-token>" }
```

- `200` — email verified; returns `{ success, data: { message } }`
- `400` — missing or malformed token
- `401` — invalid, expired, or already-used token

#### POST /api/v1/auth/resend-verification

Sends a fresh verification email for the given address. Any previous
verification link for that account is immediately invalidated. The endpoint
returns the **same success message** whether the address is unknown, already
verified, or belongs to an unverified account, so it never reveals whether an
email exists.

```json
{ "email": "ahmed@example.com" }
```

- `200` — accepted (no account enumeration)
- `400` — invalid email

#### POST /api/v1/auth/forgot-password

Sends a single-use password-reset email if the address belongs to an account,
and invalidates any previous reset link for that account. Like
`resend-verification`, it always returns the same generic success message.

```json
{ "email": "ahmed@example.com" }
```

- `200` — accepted (no account enumeration)
- `400` — invalid email

#### POST /api/v1/auth/reset-password

Sets a new password using the single-use token from the reset email. The token
expires after `PASSWORD_RESET_TOKEN_TTL_MINUTES` (default 60 minutes) and can be
used only once. A successful reset **revokes every existing session** (all
refresh tokens) for the user.

```json
{ "token": "<reset-token>", "newPassword": "password123" }
```

- `200` — password changed; returns `{ success, data: { message } }`
- `400` — missing or malformed token, or invalid password
- `401` — invalid, expired, or already-used token

> The four endpoints share a dedicated, tighter rate limit
> (`AUTH_EMAIL_RATE_LIMIT_MAX`, default 5 requests per window per IP) since they
> accept unauthenticated email or token input.

### Authentication Internals

- Access tokens are **JWT** signed with the configured `JWT_SECRET` and expire
  after `JWT_EXPIRES_IN`.
- Refresh tokens are **opaque, high-entropy random strings** (256 bits) returned
  to the client only at issuance time and persisted as **SHA-256 hashes** in the
  `RefreshToken` table (`tokenHash` is unique). Neither the raw token nor its
  hash is ever logged or returned.
- Refresh sessions expire after `REFRESH_TOKEN_TTL_DAYS`; a record's `revokedAt`
  marks an invalidated or rotated session.
- Refresh tokens are **rotated on every refresh** inside a single Prisma
  transaction: the old session is conditionally revoked (`revokedAt: null` guard)
  and its replacement is persisted atomically, making replay of an already-rotated
  token fail safely even under concurrency.
- Email-verification and password-reset tokens are **opaque, high-entropy random
  strings** (256 bits) whose SHA-256 hashes live in the `AuthToken` table
  (`tokenHash` unique). A token belongs to exactly one user and purpose
  (`EMAIL_VERIFICATION`/`PASSWORD_RESET`), can be used once (guarded in the same
  transaction), and expires after the configured TTL. Only the hash is ever
  stored — raw tokens, refresh tokens, passwords, and SMTP credentials are never
  logged.
- Re-issuing a token for the same user/purpose (resend / forgot) atomically
  deletes the previous one, so old links stop working. Password reset consumes
  the token, replaces the password hash, and revokes all refresh sessions in a
  single transaction.
- Resend/forgot endpoints return the same generic message for unknown, known,
  and already-verified accounts and spend a comparable bcrypt baseline on the
  unknown branch, preventing account enumeration and (best-effort) timing
  differences.

### Registration notes

A successful registration also creates the refresh token and the
email-verification token in the same transaction. Signing in does **not** require
prior verification; `emailVerifiedAt` is set when `verify-email` succeeds.
Resending for an already-verified account returns the generic message and mints
no new token.
- The `authenticate` middleware (`src/middleware/authenticate.ts`) validates the
  `Authorization: Bearer` header on protected routes and attaches `req.userId`.
- Passwords are never stored in plaintext and never returned to clients.
- Application error codes live in `src/constants/app-errors.ts`, and domain
  errors are thrown as `AppError` subclasses (`src/errors/app.error.ts`) carrying
  an HTTP status and machine-readable code. The centralized error handler
  serializes them into consistent responses without leaking internals.

## Groups API

Group and membership endpoints live under `/api/v1/groups`. Every group endpoint
requires authentication via the `Authorization: Bearer <jwt>` header.

### Authorization Model

- **Owner** (the user who created the group, `group.createdById`) may update the
  group name, delete the group, and add/remove members.
- **Members** (users with a `GroupMember` record) may view the group detail and
  member list, and list the group in their own group list.
- **Non-members** may not view group details; they receive HTTP 403.
- The group owner is automatically the first member and cannot be removed.

### POST /api/v1/groups

Creates a new group. The authenticated user becomes the owner and is
automatically added as the first member in a single database transaction.

Request body:

```json
{
  "name": "Trip to Naran"
}
```

- `name` — required, non-empty string (trimmed)

- `201` — group created; returns `{ success, data: { group } }`
- `400` — validation failed
- `401` — missing/invalid token

Response (201):

```json
{
  "success": true,
  "data": {
    "group": {
      "id": "<uuid>",
      "name": "Trip to Naran",
      "createdById": "<owner-uuid>",
      "createdAt": "...",
      "updatedAt": "..."
    }
  }
}
```

### GET /api/v1/groups

Lists all groups the authenticated user is a member of, including the member count.

- `200` — returns `{ success, data: { groups } }`; an empty array when the user has no groups
- `401` — missing/invalid token

Response (200):

```json
{
  "success": true,
  "data": {
    "groups": [
      {
        "id": "<uuid>",
        "name": "Trip to Naran",
        "createdById": "<owner-uuid>",
        "memberCount": 5,
        "createdAt": "...",
        "updatedAt": "..."
      }
    ]
  }
}
```

### GET /api/v1/groups/:id

Returns group details and the full member list. The authenticated user must be a member.

- `200` — returns `{ success, data: { group } }`
- `401` — missing/invalid token
- `403` — authenticated user is not a member
- `404` — group does not exist

Response (200):

```json
{
  "success": true,
  "data": {
    "group": {
      "id": "<uuid>",
      "name": "Trip to Naran",
      "createdById": "<owner-uuid>",
      "createdAt": "...",
      "updatedAt": "...",
      "members": [
        { "id": "<uuid>", "name": "Ahmed Raza", "email": "ahmed@example.com" }
      ]
    }
  }
}
```

> Only the member's `id`, `name`, and `email` are returned — never a password hash
> or other sensitive authentication data.

### PUT /api/v1/groups/:id

Updates the group name. The authenticated user must be the owner.

Request body:

```json
{
  "name": "Updated Name"
}
```

- `200` — group updated; returns `{ success, data: { group } }`
- `400` — validation failed
- `401` — missing/invalid token
- `403` — authenticated user is not the owner
- `404` — group does not exist

### DELETE /api/v1/groups/:id

Deletes the group. The authenticated user must be the owner. Related records
(memberships, expenses, settlements, activities) are removed by the existing
Prisma cascade relationships.

- `204` — group deleted (no response body)
- `401` — missing/invalid token
- `403` — authenticated user is not the owner
- `404` — group does not exist

### POST /api/v1/groups/:id/members

Adds a member to the group. The authenticated user must be the owner.

Request body:

```json
{
  "userId": "<target-user-uuid>"
}
```

- `201` — member added; returns `{ success, data: { member } }`
- `400` — validation failed
- `401` — missing/invalid token
- `403` — authenticated user is not the owner
- `404` — group or target user does not exist
- `409` — target user is already a member

### DELETE /api/v1/groups/:id/members/:memberId

Removes a member from the group. The authenticated user must be the owner. The
owner cannot be removed.

- `204` — member removed (no response body)
- `401` — missing/invalid token
- `403` — authenticated user is not the owner
- `404` — group or member does not exist
- `409` — attempting to remove the group owner

### Groups Internals

The groups module lives under `src/modules/groups/` and follows the same layered
architecture as `auth`: routes → controller → service → repository → Prisma. The
service owns authorization (ownership and membership checks) and throws grouped
`AppError` subclasses (`ForbiddenError`, `NotFoundError`, `ConflictError`) that
the centralized error handler serializes.

`GET /groups/:id` reads through a **cache-aside** path (`group.cache.ts`): the
service checks the group-scoped Redis entry first, authorizes membership (always
against PostgreSQL, hit or miss), serves a hit without the group query, and
re-populates the cache on a miss. Every mutating group operation (rename,
delete, member add/remove) invalidates the group's cache entry after the
database write commits. See [Redis Caching](#redis-caching) for the full
rationale, key layout, TTL, and failure behavior.

## Expenses API

Expense endpoints live under `/api/v1/groups/:groupId/expenses` and
`/api/v1/expenses`. Every expense endpoint requires authentication via the
`Authorization: Bearer <jwt>` header.

### Authorization Model

- Any **group member** may create an expense in the group, list the group's
  expenses, and view an individual expense.
- The **payer** (who paid for the expense) must be a member of the same group.
- Every **split participant** must be a member of the same group — arbitrary
  users outside the group cannot appear in a split.
- **Non-members** (or members of another group) cannot create, list, or view the
  group's expenses; they receive HTTP 403.

### Money Representation

All amounts are expressed as **integer minor units** (e.g. paisa for PKR), stored
as `BigInt` in the database — see [Money Representation](#money-representation).
The API accepts and returns whole-number minor units and never uses
floating-point arithmetic for split calculations.

### POST /api/v1/groups/:groupId/expenses

Creates an expense and its `ExpenseSplit` records inside a single database
transaction. The authenticated requester must be a member of the group.

Request body:

```json
{
  "description": "Dinner",
  "amountMinorUnits": 1000,
  "payerId": "<member-uuid>",
  "splitType": "EQUAL",
  "participants": [
    { "userId": "<member-uuid>" },
    { "userId": "<member-uuid>" },
    { "userId": "<member-uuid>" }
  ],
  "expenseDate": "2026-01-01T00:00:00.000Z"
}
```

Fields:
- `description` — required, non-empty string (trimmed)
- `amountMinorUnits` — required, positive integer minor units
- `payerId` — required, must be a member of the group
- `splitType` — required, `EQUAL` or `EXACT`
- `participants` — required, non-empty array of member user IDs; each user must
  be a group member and appear at most once
- `expenseDate` — optional RFC-3339 date, defaults to the server time

**EQUAL:** the total is divided into equal shares; any smallest-unit remainder is
assigned one extra minor unit to the first participants, so the shares always sum
to the total exactly (e.g. `1000` across 3 → `334`, `333`, `333`).

**EXACT:** each participant must provide an `amountMinorUnits`; the provided
amounts must sum to the expense total exactly.

- `201` — expense created; returns `{ success, data: { expense } }` with splits
- `400` — validation failed, duplicate participant, or EXACT split total mismatch
- `401` — missing/invalid token
- `403` — requester, payer, or a split participant is not a group member
- `404` — group does not exist

### GET /api/v1/groups/:groupId/expenses

Lists the expenses belonging to a group, newest first, including the payer and a
split count. The authenticated requester must be a member of the group.

- `200` — returns `{ success, data: { expenses } }`; empty array when the group has none
- `401` — missing/invalid token
- `403` — authenticated user is not a member
- `404` — group does not exist

### GET /api/v1/expenses/:id

Returns a single expense with its full split details (including each
participant's `id`, `name`, and `email`). The authenticated requester must be a
member of the group the expense belongs to.

- `200` — returns `{ success, data: { expense } }`
- `401` — missing/invalid token
- `403` — authenticated user is not a member of the expense's group
- `404` — expense does not exist

### PATCH /api/v1/expenses/:id

Partially updates an expense. The authenticated requester must be a member of
the group the expense belongs to. At least one field is required. `EQUAL` splits
are always recomputed, so changing the total also redistributes the existing
participants (equal splits always sum to the total). With `EXACT` splits the
provided amounts must sum to the total; when `participants` is omitted the
existing participant set and amounts are kept and only the sum is re-validated
against the (possibly new) total. The payer must be a group member and every
participant must be a group member. The currency is never editable. The expense,
its splits, and an `EXPENSE_UPDATED` activity event are persisted atomically.

Allowed fields (all optional):

- `description` — non-empty string, max 280 characters
- `amountMinorUnits` — non-negative integer minor units
- `payerId` — the member who paid for the expense
- `splitType` — `EQUAL` or `EXACT`
- `participants` — replaces the participant set: `[{ userId, amountMinorUnits? }]`
- `expenseDate` — ISO 8601 date with offset

- `200` — returns `{ success, data: { expense } }` with the recomputed splits
- `400` — validation failed (empty body, EXACT amounts not summing to the total, duplicate participants)
- `401` — missing/invalid token
- `403` — requester, payer, or a participant is not a group member
- `404` — expense does not exist

### DELETE /api/v1/expenses/:id

Deletes an expense and its splits. The authenticated requester must be a member
of the group the expense belongs to. Deletes the expense and records an
`EXPENSE_DELETED` activity event carrying the deleted amount and currency in a
single transaction, so the group's activity feed remains a faithful audit trail.
Group balances are always derived from the remaining expenses; the summary
snapshot is recomputed via the existing recompute job.

- `204` — deleted; no body
- `401` — missing/invalid token
- `403` — authenticated user is not a member of the expense's group
- `404` — expense does not exist

### Expenses Internals

The expenses module lives under `src/modules/expenses/` and follows the same
layered architecture as `auth` and `groups`. The split math is factored into a
pure, deterministic module (`split.util.ts`) that is unit-tested directly. The
service owns validation of group/payer/participant membership and split
reconciliation, and throws grouped `AppError` subclasses (`BadRequestError`,
`ForbiddenError`, `NotFoundError`) that the centralized error handler serializes.

## Balances & Settlements API

Balance and settlement endpoints live under `/api/v1/groups/:groupId/balances`,
`/api/v1/groups/:groupId/settlements`, and `/api/v1/settlements`. Every endpoint
requires authentication via the `Authorization: Bearer <jwt>` header.

### Authorization Model

- Any **group member** may view group balances, list the group's settlements,
  record a settlement, and view an individual settlement.
- The settlement **sender** (`payerId`) and **receiver** (`payeeId`) must be
  members of the same group.
- **Non-members** (or members of another group) receive HTTP 403, preventing
  cross-group data access.

### Money Representation

All balances and settlement amounts use the same integer **minor units** as
expenses (see [Money Representation](#money-representation)). Balance math is
pure `BigInt` arithmetic — no floating-point values are ever produced.

### GET /api/v1/groups/:groupId/balances

Returns each member's net balance for the group, derived at request time from the
group's expenses, splits, and settlements (no persisted balance column). A
positive balance is a net credit (owed by the group); a negative balance is a net
debt. The authenticated requester must be a member.

- `200` — returns `{ success, data: { balances } }`
- `401` — missing/invalid token
- `403` — authenticated user is not a member
- `404` — group does not exist

Response examples:

```json
{
  "success": true,
  "data": {
    "balances": [
      { "userId": "<alice-uuid>", "name": "Alice", "email": "alice@example.com", "amountMinorUnits": 160 },
      { "userId": "<bob-uuid>", "name": "Bob", "email": "bob@example.com", "amountMinorUnits": -60 },
      { "userId": "<owner-uuid>", "name": "Owner", "email": "owner@example.com", "amountMinorUnits": -100 }
    ]
  }
}
```

> The sum of all `amountMinorUnits` values always equals zero. Only each member's
> `id`, `name`, and `email` are returned — never a password hash or other secret.

### POST /api/v1/groups/:groupId/settlements

Records a payment from one group member (sender) to another (receiver) to settle
debts. The authenticated requester must be a group member.

This operation is **idempotency-protected**: every request must carry an
`Idempotency-Key` header so that retries can never create duplicate settlements.
See [Idempotency](#idempotency).

Request header:

```
Idempotency-Key: <unique-key>
```

Request body:

```json
{
  "payerId": "<sender-uuid>",
  "payeeId": "<receiver-uuid>",
  "amountMinorUnits": 500
}
```

Fields:
- `payerId` — required, sender must be a group member
- `payeeId` — required, receiver must be a group member and different from `payerId`
- `amountMinorUnits` — required, positive integer minor units

- `201` — settlement created; returns `{ success, data: { settlement } }`. A retry
  with the same key and body returns the original settlement instead of creating
  a duplicate.
- `400` — validation failed, sender equals receiver, or the `Idempotency-Key`
  header is missing/invalid
- `401` — missing/invalid token
- `403` — requester, sender, or receiver is not a group member
- `404` — group does not exist
- `409` — the same `Idempotency-Key` was already used with a different request or
  by a different user, or a request with this key is already being processed

### GET /api/v1/groups/:groupId/settlements

Lists the settlements belonging to a group (newest first), including the sender
and receiver. The authenticated requester must be a member.

- `200` — returns `{ success, data: { settlements } }`; empty array when the group has none
- `401` — missing/invalid token
- `403` — authenticated user is not a member
- `404` — group does not exist

### GET /api/v1/settlements/:id

Returns a single settlement with its sender and receiver. The authenticated
requester must be a member of the group the settlement belongs to.

- `200` — returns `{ success, data: { settlement } }`
- `401` — missing/invalid token
- `403` — authenticated user is not a member of the settlement's group
- `404` — settlement does not exist

### Balances & Settlements Internals

The module lives under `src/modules/settlements/` and follows the same layered
architecture as `auth`, `groups`, and `expenses`. The balance math is factored
into a pure, deterministic module (`balance.util.ts`) that is unit-tested
directly. The service owns membership authorization and throws grouped `AppError`
subclasses (`BadRequestError`, `ForbiddenError`, `NotFoundError`) that the
centralized error handler serializes. Settlement creation claims and completes
an idempotency record inside the same Prisma transaction that records the
settlement, so duplicate requests can never produce duplicate financial records.

## Idempotency

State-changing financial operations are protected against duplicate processing
caused by client retries. The mechanism is persistent (backed by the
`IdempotencyRecord` table), enforced at the database level, and transactional —
it does not rely on in-memory state, so it remains correct across restarts and
multiple server instances.

### Supported Endpoints

| Endpoint | Idempotency |
|---|---|
| `POST /api/v1/groups/:groupId/settlements` | Required `Idempotency-Key` header |

### Providing an Idempotency-Key

Send a unique key in the request header for each logical operation:

```
POST /api/v1/groups/:groupId/settlements
Authorization: Bearer <jwt>
Idempotency-Key: 9f8e7d6c5b4a39281706
Content-Type: application/json

{
  "payerId": "<sender-uuid>",
  "payeeId": "<receiver-uuid>",
  "amountMinorUnits": 500
}
```

The key must be 8–128 characters long and may contain only letters, digits,
`_`, `-`, and `.` (UUIDs work well). The same key must be reused for every
retry of the same logical request and **must never be reused for a different
request**.

The key is treated as request metadata for duplicate detection, never as a
financial or business field, and is never returned in responses or logged.

### Retry Semantics

- **First request:** the settlement is created and the key is recorded.
- **Retry with the same key and the same body:** no new settlement is created;
  the original settlement is returned.
- **Retry with the same key but a different body:** rejected with HTTP 409.
- **Reuse of a key issued to a different user:** rejected with HTTP 409.
- **Two concurrent requests using the same key:** the database's unique
  constraint guarantees that only one settlement is created; the losing request
  receives the original result.
- **Failed operation:** the idempotency record and the settlement are written in
  one transaction, so a failure rolls back both and a legitimate retry succeeds.

### Key Lifetime

Idempotency records expire 24 hours after first use. Expired keys are reclaimed
and can be reused for a new operation. No automatic cleanup job is required for
correctness; a background sweep that removes records where `expiresAt` is in the
past can be introduced later for storage hygiene.

## Activity API

Activity endpoints live under `/api/v1/groups/:groupId/activity`. Every activity
endpoint requires authentication via the `Authorization: Bearer <jwt>` header.

### Purpose

Activity events form a historical, auditable record of meaningful actions within
a group (group creation, members added/removed, expenses added/updated/deleted,
settlements recorded). They are **not** the source of truth for financial
calculation. Balances remain derived from expenses, splits, and settlements only.

### Authorization Model

- Any **group member** may view the group's activity feed.
- **Non-members** (or members of another group) receive HTTP 403, preventing
  cross-group activity access / IDOR.
- Activity event actors are always recorded from the authenticated requester
  (`req.userId`), never from request-body fields.

### GET /api/v1/groups/:groupId/activity

Returns a paginated list of the group's activity events, newest first. The
authenticated requester must be a member of the group.

Query parameters:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | integer | `1` | Page number, 1-based |
| `limit` | integer | `20` | Events per page, `1`–`50` |

- `200` — returns `{ success, data: { events }, pagination }`
- `400` — validation failed (invalid page/limit, excessive limit, or unknown parameters)
- `401` — missing/invalid token
- `403` — authenticated user is not a member
- `404` — group does not exist

Response (200):

```json
{
  "success": true,
  "data": {
    "events": [
      {
        "id": "<uuid>",
        "groupId": "<group-uuid>",
        "userId": "<actor-uuid>",
        "type": "EXPENSE_ADDED",
        "message": "added the expense \"Dinner\"",
        "amountMinorUnits": 1000,
        "currencyCode": "PKR",
        "occurredAt": "...",
        "createdAt": "...",
        "user": { "id": "<uuid>", "name": "Ahmed Raza", "email": "ahmed@example.com" }
      }
    ]
  },
  "pagination": { "page": 1, "limit": 20, "total": 12 }
}
```

Supported `type` values: `GROUP_CREATED`, `GROUP_UPDATED`, `MEMBER_ADDED`,
`MEMBER_REMOVED`, `EXPENSE_ADDED`, `EXPENSE_UPDATED`, `EXPENSE_DELETED`,
`SETTLEMENT_ADDED`. Events are filtered by `groupId` and paginated at the
database level; only the actor's `id`, `name`, and `email` are returned — never
a password hash or other sensitive authentication data.

### Activity Internals

The module lives under `src/modules/activity/` and follows the same layered
architecture as the other modules. Activity reads go through
`ActivityService.getGroupActivity` with database-level filtering, ordering, and
pagination. Activity writes are emitted inside the *same* Prisma transactions as
the domain operations that produce them (group creation/rename, member
add/remove, expense creation/update/deletion, settlement creation), so a domain
record can never be committed without its corresponding activity event.

## Group Summary API

Group summary endpoints live under `/api/v1/groups/:groupId/summary`. Every
endpoint requires authentication via the `Authorization: Bearer <jwt>` header.

### Purpose

The group summary is a **derived, non-authoritative snapshot** (total spent,
expense count, settlement count, member count) computed in the background by the
worker and stored in the `GroupSummary` table. The authoritative source of truth
remains the group's expenses, settlements, and memberships; the snapshot just
saves clients from recomputing aggregates on every read. Although recomputation
is currently triggered manually, it runs on the same Redis-backed job queue used
for all future asynchronous work.

### Authorization Model

- Any **group member** may enqueue a recompute and read the summary.
- **Non-members** receive HTTP 403, preventing cross-group summary access (IDOR).

### POST /api/v1/groups/:groupId/summary/recompute

Enqueues a `GROUP_SUMMARY_RECOMPUTE` background job. A group member may request
a refresh; the worker recomputes the aggregates from source tables and upserts
the snapshot. This endpoint does **not** compute anything synchronously.

- `202` — accepted; returns `{ success, data: { job } }` with the job id, type,
  and `status: "queued"`. The summary is refreshed asynchronously.
- `401` — missing/invalid token
- `403` — authenticated user is not a member
- `404` — group does not exist
- `500` — the job could not be queued (Redis unavailable); the request fails
  cleanly rather than silently accepting a job that would never run

### GET /api/v1/groups/:groupId/summary

Returns the latest computed summary snapshot, if one exists.

- `200` — returns `{ success, data: { summary } }` with `totalSpentMinorUnits`
  (Number), `expenseCount`, `settlementCount`, `memberCount`, `currencyCode`,
  and `computedAt`
- `401` — missing/invalid token
- `403` — authenticated user is not a member
- `404` — group does not exist, **or** no summary has been computed yet
  (`GROUP_SUMMARY_NOT_FOUND`); queue a recompute to generate one

### Summary Internals

The module lives under `src/modules/summary/` and follows the same layered
architecture as the other modules: the controller authorizes via the service,
the service enqueues the recompute job (or reads the snapshot), and the
repository owns the aggregation and upsert. The worker's job handler
(`summary.jobs.ts`) delegates to the repository's `aggregateGroup` (sum + counts
via `Promise.all`) and an idempotent `groupSummary.upsert` keyed on the unique
`groupId` — which is what makes duplicate job deliveries harmless.

## Database Schema

The Prisma schema is located at `prisma/schema.prisma` and uses PostgreSQL as the datasource provider.

### Entities

| Entity | Description |
|---|---|
| `User` | Application user with email (unique), name, optional passwordHash for future auth |
| `Group` | A bill-splitting group (e.g., "Trip to Naran", "Roommates") |
| `GroupMember` | Many-to-many relationship between Users and Groups; unique on (groupId, userId) |
| `Expense` | An expense paid by one user within a group, with a split type (EQUAL or EXACT) |
| `ExpenseSplit` | A user's share of an expense, stored as exact minor-unit amounts |
| `Settlement` | A payment recorded from one user to another to settle debts |
| `ActivityEvent` | Activity feed entry capturing expenses, settlements, group events |
| `RefreshToken` | JWT refresh token hash for future auth session management |
| `IdempotencyRecord` | Persistent idempotency deduplication for financial operations |
| `GroupSummary` | Derived group snapshot (total spent, counts) upserted by the background worker |

### Enums

| Enum | Values |
|---|---|
| `SplitType` | `EQUAL`, `EXACT` |
| `ActivityType` | `EXPENSE_ADDED`, `SETTLEMENT_ADDED`, `GROUP_CREATED`, `MEMBER_ADDED` |
| `IdempotencyStatus` | `PENDING` (in-flight), `COMPLETED` |

### Important Relationship Decisions

- **User → Group (owner):** `onDelete: Restrict` — deleting a user that owns groups requires removing/reassigning the group first.
- **Group → GroupMember:** `onDelete: Cascade` — deleting a group removes all its memberships.
- **User → GroupMember:** `onDelete: Cascade` — deleting a user removes them from all groups.
- **Group → Expense:** `onDelete: Cascade` — deleting a group removes all its expenses.
- **Expense → ExpenseSplit:** `onDelete: Cascade` — deleting an expense removes all splits.
- **User → Expense (payer), ExpenseSplit, Settlement (payer/payee), ActivityEvent (actor):** `onDelete: Restrict` — prevents deleting a user that has financial records.
- **User → RefreshToken:** `onDelete: Cascade` — deleting a user removes their refresh tokens.
- **User → IdempotencyRecord:** `onDelete: Cascade` — deleting a user removes their idempotency keys.
- **Group → GroupSummary:** `onDelete: Cascade` — deleting a group removes its derived summary snapshot.

### Indexing

| Table | Index | Justification |
|---|---|---|
| `Group` | `createdById` | Look up groups by owner |
| `GroupMember` | `userId` | Look up all groups for a user |
| `GroupMember` | `[groupId, userId]` (unique) | Prevent duplicate membership; fast join lookups |
| `Expense` | `groupId` | List expenses within a group |
| `Expense` | `paidById` | Look up expenses paid by a user |
| `Expense` | `expenseDate` | Time-range queries on expenses |
| `ExpenseSplit` | `userId` | Look up all splits for a user |
| `ExpenseSplit` | `[expenseId, userId]` (unique) | Prevent duplicate splits per expense per user |
| `Settlement` | `groupId` | List settlements within a group |
| `Settlement` | `payerId` | Look up settlements made by a user |
| `Settlement` | `payeeId` | Look up settlements received by a user |
| `ActivityEvent` | `groupId` | List activity within a group |
| `ActivityEvent` | `occurredAt` | Time-range queries, chronological feed |
| `RefreshToken` | `tokenHash` (unique) | Fast token lookup during auth; prevents duplicates |
| `RefreshToken` | `userId` | Look up all tokens for a user |
| `IdempotencyRecord` | `key` (unique) | Prevent duplicate idempotency keys across all users |
| `IdempotencyRecord` | `userId` | Look up keys issued to a user |
| `IdempotencyRecord` | `expiresAt` | Expiry sweep and lifetime queries |
| `GroupSummary` | `groupId` (unique) | One snapshot per group; single-row upsert target |
| `User` | `email` (unique) | Login lookup; prevents duplicate emails |

## Money Representation

**All monetary values are stored as integer minor units (paisa) in PostgreSQL `BIGINT` columns.** This matches the frontend's `Money.minorUnits` (Dart `int`) convention and completely eliminates floating-point rounding errors in financial calculations.

For example, PKR 4,500.00 is stored as `450000` minor units. No `Float`, `Double`, or `Decimal` types are used for money.

The `currencyCode` field (default `PKR`) is stored on financial records for future multi-currency extensibility, but the application currently operates in PKR only.

## Identifier Strategy

All entities use **UUID strings** generated by Prisma's `@default(uuid())` generator. This provides globally unique, non-sequential identifiers that are safe for client exposure and consistent across all entities.

## Development Hot Reload

The `PrismaClient` instance is cached on `globalThis` during development to prevent multiple database connections when `tsx watch` triggers file reloads.

In production, a single client instance is reused across all HTTP requests.

## Architecture

Feature modules follow a strict layered dependency flow, keeping HTTP concerns,
business logic, and data access separate:

```
Routes
  → Controller   (handle HTTP req/res, call service)
  → Service      (business logic, auth, hashing, tokens)
  → Repository   (Prisma data access)
  → Prisma       (database)
```

Between the service and the repository, the **group detail** read path sits a
cache-aside Redis layer (`service → Redis cache → repository → PostgreSQL`): a
hit skips the repository query, a miss reads PostgreSQL and repopulates Redis.
Caching is applied per-operation — see [Redis Caching](#redis-caching) — and
never changes the response contract.

Each feature lives under `src/modules/<feature>/`. The `auth`, `groups`,
`expenses`, `settlements`, and `activity` modules are the reference examples.
Controllers parse the validated request and delegate to the service; the service
owns rules (duplicate-email detection, password verification, token signing,
group ownership/membership authorization, expense split validation, balance
derivation, settlement membership rules, activity authorization) and throws
application errors that the centralized error handler converts to the standard
error response.

## Current Implementation Status

Implemented so far (auth + groups + expenses + balances/settlements + activity feed):

- TypeScript project configuration (strict mode)
- Express application with middleware (CORS, Helmet, rate limiting, JSON parsing)
- Centralized rate limiting via `express-rate-limit` — per-IP limiter for all
  `/api/v1` endpoints plus a stricter tier for `/api/v1/auth/*`, with a 429 error
  envelope, `RateLimit-*`/`Retry-After` headers, and env-tunable windows/limits
- **Redis infrastructure** (`src/redis/`) — lazy ioredis client with fail-fast
  offline commands, non-fatal startup connect, and graceful shutdown
- **Redis-backed distributed rate limiting** — fixed-window Lua store shared
  across instances (fallback to process-local `MemoryStore`), separate
  `rl:api:`/`rl:auth:` namespaces, `passOnStoreError` fail-open policy
- **Distributed locking** (`src/redis/distributedLock.ts`) — `SET NX PX` + token
  ownership, Lua release, TTL backstop, conflict → HTTP 409
  `SETTLEMENT_CONCURRENT_LOCKED`, Redis outage → degraded uncoordinated run with
  warning
- **In-process edge/gateway layer** (`src/edge/`) — `TRUST_PROXY`-driven
  `req.ip` resolution, URL/body-size/request-ID screening before rate limiting,
  HTTP 413 handling for oversized bodies
- Centralized configuration via Zod-validated environment variables
- Health check endpoints (liveness + database readiness)
- Centralized error handling (application errors, validation errors, 404)
- Zod validation middleware infrastructure
- Structured JSON logging
- HTTP status code enum (`HTTP_STATUSES`)
- API routing foundation under `/api/v1`
- PostgreSQL integration via Prisma ORM
- Prisma schema (User, Group, GroupMember, Expense, ExpenseSplit, Settlement, ActivityEvent, RefreshToken)
- Initial database migration
- Centralized Prisma client module with lifecycle utilities
- Readiness endpoint (`/health/ready`) with mocked DB check in tests
- Database scripts (`db:generate`, `db:migrate`, `db:migrate:dev`, `db:studio`, `db:validate`)
- **Authentication API** (`/api/v1/auth/register`, `/api/v1/auth/login`, `/api/v1/auth/refresh`, `/api/v1/auth/logout`, `/api/v1/auth/me` GET + PATCH)
- JWT token signing/verification with configurable secret and lifetime
- bcrypt password hashing (never stored or returned in plaintext)
- Opaque refresh tokens with SHA-256 hashing at rest (`RefreshToken.tokenHash`)
- Atomic refresh-token rotation (conditional revoke + replacement in one transaction)
- Revocation-based session logout (idempotent) and `REFRESH_TOKEN_INVALID` safe errors
- `authenticate` middleware for protecting routes
- **Profile update** (`PATCH /api/v1/auth/me`) — name/email update with email-uniqueness enforcement and strict rejection of privileged fields
- **Email verification** (`POST /api/v1/auth/verify-email`, `POST /api/v1/auth/resend-verification`) — single-use opaque tokens (SHA-256 hashed at rest) with configurable TTL; resend invalidates the previous link; generic success messages prevent account enumeration
- **Password recovery** (`POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/reset-password`) — single-use reset tokens, configurable TTL, atomic consume + password change + full session revocation
- **Transactional email service** (`src/modules/email/`) — `EmailProvider` abstraction with a Nodemailer SMTP transport (`EMAIL_ENABLED=true`) and a log transport (`EMAIL_ENABLED=false`, the local-development default); best-effort delivery that never fails registration/forgot-password; Strict no-secrets logging (no bodies, tokens, passwords, or SMTP credentials in logs); email metrics (`emails_sent_total`, `email_send_failures_total`)
- Dedicated sensitive rate limiter (`AUTH_EMAIL_RATE_LIMIT_MAX`) for the public email/verification endpoints
- Module-based architecture (`src/modules/auth/`): routes → controller → service → repository → Prisma
- **Groups & membership API** (`/api/v1/groups` CRUD + add/remove members)
- Owner/member authorization for groups (`ForbiddenError` / HTTP 403)
- Group creation with atomic creator-membership Prisma transaction
- **Expenses & split API** (`/api/v1/groups/:groupId/expenses` create/list, `/api/v1/expenses/:id` detail + PATCH + DELETE)
- Group membership authorization for expenses (requester, payer, and split participants)
- Deterministic EQUAL split calculation with exact-total remainder distribution
- EXACT split validation (sum must equal the expense total)
- Atomic expense + splits creation via a single Prisma transaction
- Pure, unit-tested split calculation module (`split.util.ts`)
- **Expense update** (`PATCH /api/v1/expenses/:id`) — partial update that merges over the current expense, recomputes splits, and persists expense + splits + `EXPENSE_UPDATED` activity event atomically
- **Expense delete** (`DELETE /api/v1/expenses/:id`) — deletes the expense (splits cascade) and records an `EXPENSE_DELETED` activity event carrying the deleted amount/currency in the same transaction
- **Balance calculation API** (`/api/v1/groups/:groupId/balances`)
- Balances derived at request time from expenses, splits, and settlements (no persisted balance column)
- Pure, unit-tested BIGINT balance calculation module (`balance.util.ts`) with a sum-to-zero invariant
- **Settlement API** (`/api/v1/groups/:groupId/settlements` create/list, `/api/v1/settlements/:id` detail)
- Group membership authorization for settlements (requester, sender, and receiver)
- Positive-amount and sender-receiver validation for settlements
- Cross-group access protection for settlement detail (IDOR guard)
- **Idempotency protection for settlement creation** — persistent, transactional, database-enforced duplicate prevention via the `IdempotencyRecord` table
- `Idempotency-Key` header validation (Zod), user/request binding, replay of original results, and concurrent-duplicate protection
- Pure, unit-tested idempotency reconciliation (`reconcile.ts`) and request fingerprinting (`request-hash.ts`)
- **Activity API** (`/api/v1/groups/:groupId/activity`)
- Group membership authorization for activity reads (IDOR guard)
- Deterministic, database-level ordering and pagination for the activity feed
- Zod validation for activity query parameters (`page`, `limit`, safe cap)
- Activity events (`GROUP_CREATED`, `GROUP_UPDATED`, `MEMBER_ADDED`, `MEMBER_REMOVED`, `EXPENSE_ADDED`, `EXPENSE_UPDATED`, `EXPENSE_DELETED`, `SETTLEMENT_ADDED`)
  recorded in the same Prisma transactions as the domain operations that produce them
- Safe actor/user projection (password hashes never exposed)
- **Background job queue** (`src/queues/`) — Redis-backed ZSET queue with
  TTL-bounded payloads and in-flight leases, at-least-once delivery, exponential
  backoff retries (`JOB_QUEUE_*`), `PermanentJobFailureError` for non-retryable
  work, an explicit job-type registry, and a poll-loop worker runner with
  graceful shutdown
- **Worker process** (`src/worker.ts`, `npm run worker`) — DB + Redis startup
  (fatal on Redis failure, unlike the API server), request-ID correlation into
  job logs, clean shutdown that drains in-flight work
- **Group Summary API** (`/api/v1/groups/:groupId/summary`) — `POST
  /summary/recompute` enqueues a recompute job (HTTP 202 with a job receipt;
  500 on queue failure instead of a false accept) and `GET /summary` reads the
  derived snapshot (404 until the first recompute completes)
- **GroupSummary model** — derived, non-authoritative snapshot upserted by the
  worker (idempotent by unique `groupId`); authoritative data stays in
  expenses/settlements/memberships
- **Redis caching (cache-aside)** (`src/redis/cacheStore.ts` +
  `src/modules/groups/group.cache.ts`) — group details (`GET /groups/:id`) served
  from Redis under `cache:group:{groupId}` with a `CACHE_GROUP_TTL_SECONDS`
  safety net; membership authorization always enforced (never bypassed by a hit);
  invalidation on rename/delete/member add/member remove; Redis outages degrade
  to PostgreSQL with logging (read=miss, write=log, invalidation=log), never raw
  Redis errors
- Test suite (Vitest + Supertest, all passing without a live DB)
- **OpenAPI documentation** (`src/docs/`) — a typed, modular OpenAPI 3.0.3 spec
  served as self-hosted interactive Swagger UI at `GET /api/docs` and raw JSON at
  `GET /api/docs/openapi.json`, with tests asserting documented routes exist,
  the auth contract matches, `$ref`s resolve, and money stays integer

## Not Yet Implemented

The following features are **NOT implemented** in this chunk:

- Account deletion / deactivation (never implemented: Prisma `Restrict` foreign
  keys and the absence of a deactivation column make deletion unsafe — deleting
  a user would corrupt historical financial records; account lifecycle stays out
  of scope)
- Activity feed generation logic
- Idempotency protection for expense creation (only settlement creation is protected in this PR)
- Notifications / real-time activity pushes (the feed is read on demand)
- Redis high availability: the infra assumes a single Redis endpoint; no
  Sentinel/Cluster topology or failover configuration is provided. Multi-instance
  deployments share the same Redis, so a Redis outage is a single point of
  failure for distributed enforcement (the app degrades, it does not crash).
- Lock TTL caveat: if a protected operation outlives `DISTRIBUTED_LOCK_TTL_MS`,
  two holders can overlap. Tune the TTL above the worst-case operation time.
- Automatic group-summary recompute triggers (summary recompute is currently
  manual — `POST /summary/recompute` — rather than driven automatically by
  expense/settlement writes).
- Queue observability tooling (dead-letter inspection, per-type backlog metrics,
  and job-timing dashboards are not yet built; retries and discards are logged).
- Caching is limited to group details: the user's group list, balances, and the
  activity feed are intentionally **not** cached yet (user-scoped and/or write-hot
  data with more complex invalidation), and cache population is not
  lock-protected against stampedes (the current single-lookup workload does not
  justify it — re-evaluate if a cached query grows expensive).
- Cache/backing-store consistency: because invalidation runs *after* the
  database commit, a process that crashes between the two leaves a stale entry
  that lives until the TTL expires. Tune `CACHE_GROUP_TTL_SECONDS` accordingly.

These will be built on top of this foundation in subsequent chunks.

## Frontend Compatibility

The backend error response contract (`{ success: false, message: "..." }`) is designed to be compatible with the Flutter frontend's `api_exception_mapper.dart`, which reads `data['message']` from HTTP error responses.

The API is versioned at `/api/v1` to match the frontend's `AppConstants.apiBaseUrl` pattern.

## Observability & Metrics

The backend exposes Prometheus-formatted metrics without any vendor dependency:
a small in-process registry (`src/metrics/registry.ts`) records bounded counters
and one histogram, and `src/metrics/httpMetrics.ts` attaches request metrics to
the shared request pipeline. The API serves them at `GET /metrics`
(`src/metrics/metrics.routes.ts`), gated by `METRICS_ENABLED`.

- **Scope:** aggregates only. The payload contains counters/histograms with
  bounded labels — no raw URLs, paths, IDs, emails, request IDs, query strings,
  error messages, credentials, or bodies. Request-level correlation stays in
  logs via `X-Request-Id` (see [Request Tracing](#request-tracing)); metrics are
  deliberately free of per-request identifiers to keep cardinality low.
- **Format:** Prometheus text exposition format 0.0.4 (`Content-Type:
  text/plain; version=0.0.4`), rendered on demand by
  `metrics.renderPrometheus()` with **no database or Redis access**.

### Exposed metrics

| Metric | Kind | Labels | Meaning |
|---|---|---|---|
| `http_requests_total` | counter | `method`, `route`, `status` | HTTP requests handled |
| `http_errors_total` | counter | `method`, `route`, `status` | HTTP responses with status ≥ 400 |
| `http_request_duration_seconds` | histogram | `method`, `route` | Request handling time (buckets 5ms … 10s) |
| `users_registered_total` | counter | — | Successful registrations |
| `groups_created_total` | counter | — | Successful group creations |
| `expenses_created_total` | counter | — | Successful expense creations |
| `expenses_updated_total` | counter | — | Successful expense updates |
| `expenses_deleted_total` | counter | — | Successful expense deletions |
| `settlements_created_total` | counter | — | Successful settlement creations |
| `activity_events_created_total` | counter | `type` | Persisted activity events |
| `background_jobs_succeeded_total` | counter | `job_type` | Jobs processed successfully |
| `background_jobs_failed_total` | counter | `job_type` | Job processing failures |
| `background_jobs_retried_total` | counter | `job_type` | Failed jobs scheduled for retry |
| `background_jobs_discarded_total` | counter | `job_type` | Jobs dropped (exhausted retries / terminal) |
| `redis_connection_errors_total` | counter | — | Redis connection errors on the shared client |
| `cache_failures_total` | counter | `operation` (`get`/`set`/`delete`) | Cache failures absorbed by the domain cache |
| `queue_failures_total` | counter | — | Background job enqueue failures |
| `database_connection_errors_total` | counter | — | PostgreSQL connection failures at startup |

### Label & cardinality rules

- **Low cardinality by construction:** label values are drawn from small,
  bounded sets — HTTP status classes (`2xx`/`3xx`/`4xx`/`5xx`/`other`),
  normalized route templates from `resolveRouteTemplate()` (e.g.
  `/api/v1/groups/:id`, never a concrete URL), the Prisma `ActivityType` enum,
  and the `JOB_TYPES` allowlist. Raw user input never becomes a label.
- **Strict catalog:** every metric is declared up front with its allowed label
  keys in `DEFAULT_METRICS`; recording strips any key not declared for that
  metric, and unknown metrics are no-ops.
- **Escaped output:** label values are escaped for safe rendering
  (`\`, `"`, and control characters).
- Route templates are resolved by identity-matching the request's route against
  the Express router stack, so nested routers report full prefixes (e.g.
  `/api/v1/groups/:id`) instead of ambiguous innermost segments.

### Worker metrics port

The background worker process has no HTTP server, so its job/Redis metrics would
otherwise be invisible. When `METRICS_PORT` is set (and `METRICS_ENABLED=true`),
the worker starts a minimal scrape listener (`src/metrics/metricsEndpoint.ts`)
serving the same text-format payload. It is shut down during graceful stop.

### Failure behavior

Observability is **never allowed to break business operations.** Recording into
the registry cannot throw (unknown/catalog-violated inputs are safe no-ops), and
the request-metrics middleware wraps its recording in `try/catch`, so a metrics
bug can at worst drop a single measurement.

### Production considerations

`GET /metrics` is unauthenticated by design (it exposes only aggregates, no user
data) and reads no external state, so it is safe for a well-known scrape target.
For production behind a shared edge, either restrict the route at the
gateway/proxy or set `METRICS_ENABLED=false`; the environment table documents
both options.

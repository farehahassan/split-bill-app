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
│   ├── errors/
│   │   └── app.error.ts          # Base AppError + specialized error classes
│   ├── middleware/
│   │   ├── authenticate.ts       # JWT bearer-token auth for protected routes
│   │   ├── errorHandler.ts       # Centralized error handling + 404
│   │   └── validate.ts           # Zod validation middleware
│   ├── modules/
│   │   ├── auth/                 # Authentication feature module
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.repository.ts
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.service.ts
│   │   │   └── validators.ts
│   │   └── groups/               # Groups & membership feature module
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
│   ├── routes/
│   │   ├── health.ts             # GET /health, GET /health/ready
│   │   ├── index.ts              # /api/v1 router
│   │   └── v1/index.ts           # Mounts feature modules (auth, groups, expenses, ...)
│   ├── types/
│   │   └── index.ts              # Shared TypeScript types
│   ├── utils/
│   │   ├── asyncHandler.ts       # Wraps async controllers to forward errors
│   │   └── logger.ts             # Lightweight structured JSON logger
│   ├── app.ts                    # Express application (testable standalone)
│   └── server.ts                 # Server startup: DB connect + graceful shutdown
├── tests/
│   ├── setup.ts                  # Test setup (env config, silent logger)
│   ├── app.test.ts               # Application + health + 404 tests
│   ├── auth.api.test.ts          # Auth endpoint integration tests (mocked DB)
│   ├── auth.service.test.ts      # Auth service unit tests (mocked repository)
│   ├── groups.api.test.ts        # Group endpoint integration tests (mocked DB)
│   ├── groups.service.test.ts    # Group service unit tests (mocked repository)
│   ├── expenses.api.test.ts      # Expense endpoint integration tests (mocked DB)
│   ├── expenses.service.test.ts  # Expense service unit tests (mocked repository)
│   ├── split.util.test.ts        # Split calculation unit tests
│   ├── config.test.ts            # Configuration validation tests
│   ├── errors.test.ts            # Error class unit tests
│   ├── asyncHandler.test.ts      # Async handler middleware tests
│   ├── health.test.ts            # Readiness endpoint tests (mocked DB)
│   └── middleware.test.ts        # Validation middleware tests
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
npm run build            # Compile TypeScript to dist/
npm start                # Run compiled server from dist/
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

## API Structure

All feature endpoints are mounted under `/api/v1`:

- `/api/v1/auth` — Authentication (register, login, current user)
- `/api/v1/users` — User management (not yet implemented)
- `/api/v1/groups` — Group management & membership
- `/api/v1/expenses` — Expense tracking & split calculation
- `/api/v1/balances` — Balance calculations (not yet implemented)
- `/api/v1/settlements` — Settlement recording (not yet implemented)
- `/api/v1/activity` — Activity feed (not yet implemented)

## Authentication API

Authentication endpoints live under `/api/v1/auth`.

### POST /api/v1/auth/register

Registers a new user and returns an access token.

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

- `201` — user created; returns `{ success, data: { user, token } }`
- `409` — an account with this email already exists
- `400` — validation failed

Response (201):

```json
{
  "success": true,
  "data": {
    "user": { "id": "<uuid>", "name": "Ahmed Raza", "email": "ahmed@example.com" },
    "token": "<jwt>"
  }
}
```

> The user object never includes `passwordHash` or `password`. Passwords are
> hashed with **bcrypt** (12 rounds) before storage.

### POST /api/v1/auth/login

Signs in an existing user and returns an access token.

Request body:

```json
{
  "email": "ahmed@example.com",
  "password": "password123"
}
```

- `200` — success; returns `{ success, data: { user, token } }`
- `401` — invalid email or password
- `400` — validation failed

### GET /api/v1/auth/me

Returns the currently authenticated user. Requires a `Bearer` token.

Request header:

```
Authorization: Bearer <jwt>
```

- `200` — success; returns `{ success, data: { user } }`
- `401` — missing, malformed, invalid, or expired token
- `404` — the authenticated user no longer exists

### Authentication Internals

- Tokens are **JWT** signed with the configured `JWT_SECRET` and expire after
  `JWT_EXPIRES_IN`.
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

### Expenses Internals

The expenses module lives under `src/modules/expenses/` and follows the same
layered architecture as `auth` and `groups`. The split math is factored into a
pure, deterministic module (`split.util.ts`) that is unit-tested directly. The
service owns validation of group/payer/participant membership and split
reconciliation, and throws grouped `AppError` subclasses (`BadRequestError`,
`ForbiddenError`, `NotFoundError`) that the centralized error handler serializes.

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

### Enums

| Enum | Values |
|---|---|
| `SplitType` | `EQUAL`, `EXACT` |
| `ActivityType` | `EXPENSE_ADDED`, `SETTLEMENT_ADDED`, `GROUP_CREATED`, `MEMBER_ADDED` |

### Important Relationship Decisions

- **User → Group (owner):** `onDelete: Restrict` — deleting a user that owns groups requires removing/reassigning the group first.
- **Group → GroupMember:** `onDelete: Cascade` — deleting a group removes all its memberships.
- **User → GroupMember:** `onDelete: Cascade` — deleting a user removes them from all groups.
- **Group → Expense:** `onDelete: Cascade` — deleting a group removes all its expenses.
- **Expense → ExpenseSplit:** `onDelete: Cascade` — deleting an expense removes all splits.
- **User → Expense (payer), ExpenseSplit, Settlement (payer/payee), ActivityEvent (actor):** `onDelete: Restrict` — prevents deleting a user that has financial records.
- **User → RefreshToken:** `onDelete: Cascade` — deleting a user removes their refresh tokens.

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

Each feature lives under `src/modules/<feature>/`. The `auth`, `groups`, and
`expenses` modules are the reference examples. Controllers parse the validated
request and delegate to the service; the service owns rules (duplicate-email
detection, password verification, token signing, group ownership/membership
authorization, expense split validation) and throws application errors that the
centralized error handler converts to the standard error response.

## Current Implementation Status

Implemented so far (auth + groups + expenses foundation):

- TypeScript project configuration (strict mode)
- Express application with middleware (CORS, Helmet, rate limiting, JSON parsing)
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
- **Authentication API** (`/api/v1/auth/register`, `/api/v1/auth/login`, `/api/v1/auth/me`)
- JWT token signing/verification with configurable secret and lifetime
- bcrypt password hashing (never stored or returned in plaintext)
- `authenticate` middleware for protecting routes
- Module-based architecture (`src/modules/auth/`): routes → controller → service → repository → Prisma
- **Groups & membership API** (`/api/v1/groups` CRUD + add/remove members)
- Owner/member authorization for groups (`ForbiddenError` / HTTP 403)
- Group creation with atomic creator-membership Prisma transaction
- **Expenses & split API** (`/api/v1/groups/:groupId/expenses` create/list, `/api/v1/expenses/:id` detail)
- Group membership authorization for expenses (requester, payer, and split participants)
- Deterministic EQUAL split calculation with exact-total remainder distribution
- EXACT split validation (sum must equal the expense total)
- Atomic expense + splits creation via a single Prisma transaction
- Pure, unit-tested split calculation module (`split.util.ts`)
- Test suite (Vitest + Supertest, 141 tests, all passing without a live DB)

## Not Yet Implemented

The following features are **NOT implemented** in this chunk:

- Refresh-token rotation & token revocation (RefreshToken model is reserved for a future chunk)
- Email verification / password reset
- User management / profile update endpoints
- Expense delete endpoint (creation, list, and detail are implemented)
- Balance calculation logic
- Settlement API endpoints (record payments)
- Activity feed generation logic

These will be built on top of this foundation in subsequent chunks.

## Frontend Compatibility

The backend error response contract (`{ success: false, message: "..." }`) is designed to be compatible with the Flutter frontend's `api_exception_mapper.dart`, which reads `data['message']` from HTTP error responses.

The API is versioned at `/api/v1` to match the frontend's `AppConstants.apiBaseUrl` pattern.

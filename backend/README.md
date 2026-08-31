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
│   │   └── http-statuses.ts      # HTTP status code enum (meaningful names)
│   ├── db/
│   │   └── prisma.ts             # Centralized Prisma client & DB utilities
│   ├── middleware/
│   │   ├── errorHandler.ts       # Centralized error handling + 404
│   │   └── validate.ts           # Zod validation middleware
│   ├── routes/
│   │   ├── health.ts             # GET /health, GET /health/ready
│   │   └── index.ts              # /api/v1 router foundation
│   ├── types/
│   │   └── index.ts              # Shared TypeScript types
│   ├── utils/
│   │   └── logger.ts             # Lightweight structured JSON logger
│   ├── app.ts                    # Express application (testable standalone)
│   └── server.ts                 # Server startup
├── tests/
│   ├── setup.ts                  # Test setup (env config, silent logger)
│   ├── app.test.ts               # Application + health + 404 tests
│   ├── config.test.ts            # Configuration validation tests
│   ├── health.test.ts            # Readiness endpoint tests (mocked DB)
│   └── middleware.test.ts         # Validation middleware tests
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

- `/api/v1/auth` — Authentication (not yet implemented)
- `/api/v1/users` — User management (not yet implemented)
- `/api/v1/groups` — Group management (not yet implemented)
- `/api/v1/expenses` — Expense tracking (not yet implemented)
- `/api/v1/balances` — Balance calculations (not yet implemented)
- `/api/v1/settlements` — Settlement recording (not yet implemented)
- `/api/v1/activity` — Activity feed (not yet implemented)

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

## Current Implementation Status

This is the database foundation (Chunks 1–2). The following are implemented:

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
- Test suite (Vitest + Supertest, 17 tests, all passing without live DB)

## Not Yet Implemented

The following features are **NOT implemented** in this chunk:

- Authentication (register, login, JWT, refresh tokens)
- User management / profile updates
- Group API endpoints (create, list, add members, delete)
- Expense API endpoints (create, list, split, delete)
- Balance calculation logic
- Settlement API endpoints (record payments)
- Activity feed generation logic

These will be built on top of this database foundation in subsequent chunks.

## Frontend Compatibility

The backend error response contract (`{ success: false, message: "..." }`) is designed to be compatible with the Flutter frontend's `api_exception_mapper.dart`, which reads `data['message']` from HTTP error responses.

The API is versioned at `/api/v1` to match the frontend's `AppConstants.apiBaseUrl` pattern.

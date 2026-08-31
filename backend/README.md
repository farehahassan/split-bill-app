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
├── src/
│   ├── config/
│   │   └── env.ts               # Zod-validated environment config
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
- PostgreSQL (for future database features)
- npm

## Installation

```bash
cd backend
npm install
```

## Environment Configuration

Copy `.env.example` to `.env` and configure:

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | `development`, `production`, or `test` |
| `PORT` | No | `3000` | HTTP server port |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed CORS origin |

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
```

## Development Server

```bash
npm run dev
```

Starts the server with `tsx watch` for automatic restarts on file changes.

## Health Endpoint

```
GET /health
```

Response:

```json
{ "status": "ok" }
```

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

## API Structure

All feature endpoints are mounted under `/api/v1`:

- `/api/v1/auth` — Authentication (not yet implemented)
- `/api/v1/users` — User management (not yet implemented)
- `/api/v1/groups` — Group management (not yet implemented)
- `/api/v1/expenses` — Expense tracking (not yet implemented)
- `/api/v1/balances` — Balance calculations (not yet implemented)
- `/api/v1/settlements` — Settlement recording (not yet implemented)
- `/api/v1/activity` — Activity feed (not yet implemented)

## Current Implementation Status

This is the backend foundation (Chunk 1). The following are implemented:

- TypeScript project configuration (strict mode)
- Express application with middleware (CORS, Helmet, rate limiting, JSON parsing)
- Centralized configuration via Zod-validated environment variables
- Health check endpoints
- Centralized error handling (application errors, validation errors, 404)
- Zod validation middleware infrastructure
- Structured JSON logging
- API routing foundation under `/api/v1`
- Test suite with Vitest and Supertest
- ESLint and Prettier configuration

## Not Yet Implemented

The following features are **NOT implemented** in this chunk:

- Authentication (register, login, JWT)
- User management
- Groups and membership
- Expenses and splits
- Balance calculations
- Settlements
- Activity feed
- Database schema and migrations (Prisma)

These will be built on top of this foundation in subsequent chunks.

## Frontend Compatibility

The backend error response contract (`{ success: false, message: "..." }`) is designed to be compatible with the Flutter frontend's `api_exception_mapper.dart`, which reads `data['message']` from HTTP error responses.

The API is versioned at `/api/v1` to match the frontend's `AppConstants.apiBaseUrl` pattern.

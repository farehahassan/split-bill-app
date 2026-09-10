# Backend Manual

Architecture, API design, and deployment documentation for the Hisab split-bill backend lives in [`backend/README.md`](../../backend/README.md).

## Status

Implemented:

- REST API for authentication, groups, expenses, balances/settlements, activity
  feed, and group summary, served under `/api/v1` and documented by a typed
  OpenAPI 3.0.3 spec with self-hosted Swagger UI at `/api/docs`.
- The Flutter client (`frontend/`) is wired to this backend through
  `frontend/lib/core/network/api_client.dart` and the feature data sources. The
  typed mock data (`frontend/lib/mock/mock_data.dart`) remains only as the
  source for the UI showcase feature; the real app screens read from the API.
- Tested at the unit level (hermetic — mocked Prisma/Redis, no live services)
  and, in CI, against real PostgreSQL and Redis via the opt-in integration
  suites in `backend/tests/integration/`.

## Planned Sections

- API design (REST endpoints for groups, expenses, balances, settlements)
- Authentication & token handling
- Database schema
- Deployment & environments
# Backend Manual

Placeholder for backend architecture, API design, and deployment documentation.

## Status

The Flutter frontend currently runs on mock data
(`split_bill_app/lib/mock/mock_data.dart`). A shared `ApiClient`
(`split_bill_app/lib/core/network/`) and repository abstractions are ready, so a
real backend can be wired in by implementing data sources against it.

## Planned Sections

- API design (REST endpoints for groups, expenses, balances, settlements)
- Authentication & token handling
- Database schema
- Deployment & environments

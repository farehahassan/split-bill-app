# Backend

Backend code for Hisab (split-bill app). Empty for now — the frontend runs on
mock data, and the API contract is being drafted in
[`manual/backend/`](../manual/backend/).

## Status

- **Nothing implemented yet.** The stack (Node/Express, FastAPI, etc.) is
  undecided — pick one and scaffold here.
- The Flutter frontend already ships a shared `ApiClient`
  (`frontend/lib/core/network/`) and repository abstractions, so the backend
  only needs to implement the endpoints those expect.

## Planned

- REST API: groups, expenses, balances, settlements, auth
- Database schema & migrations
- Deployment & environments

See the [backend manual](../manual/backend/README.md) for design docs.

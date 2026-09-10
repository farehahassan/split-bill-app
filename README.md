# Split Bill App — Monorepo

**Hisab** — a premium Flutter expense-splitting app, backed by a Node/TypeScript API.

## Layout

```text
split-bill-app/
├── frontend/                 # Flutter app (Hisab) — see its README
├── backend/                  # Node/Express/Prisma REST API — see its README
└── manual/                   # Project guides & playbooks
    ├── frontend/             #   frontend development manual
    │   └── flutter_bloc_cubit_production_playbook.md
    └── backend/              #   backend manual (API design, schema, deployment)
```

## Quick Links

- **Frontend app**: [`frontend/README.md`](frontend/README.md) — run instructions, screens, architecture, tests.
- **Backend code**: [`backend/README.md`](backend/README.md)
- **Frontend playbook**: [`manual/frontend/flutter_bloc_cubit_production_playbook.md`](manual/frontend/flutter_bloc_cubit_production_playbook.md)
- **Backend manual**: [`manual/backend/README.md`](manual/backend/README.md)

The frontend is wired to the backend API via `frontend/lib/core/network/api_client.dart`.
The typed mock data (`frontend/lib/mock/mock_data.dart`) is used only by the UI
showcase feature; the real app screens read from the API.

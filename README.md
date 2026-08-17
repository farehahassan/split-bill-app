# Split Bill App — Monorepo

**Hisab** — a premium Flutter expense-splitting app UI, plus project manuals.

## Layout

```text
split-bill-app/
├── frontend/                 # Flutter app (Hisab) — see its README
├── backend/                  # Backend code (placeholder — stack TBD)
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

The frontend currently runs on typed mock data (`frontend/lib/mock/mock_data.dart`).
A shared `ApiClient` and repository abstractions are ready for wiring the real
backend once it exists.

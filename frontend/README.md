# Hisab — Split Bill App

A premium-looking Flutter expense-splitting app UI: **Hisab** (Urdu for
*account / calculation*). The Flutter client connects to the
[HisabKitab backend](https://github.com/farehahassan/split-bill-app/tree/feat/production-deployment)
via a documented REST API.

## Quick Start

```bash
flutter pub get
flutter run
```

### API configuration

The backend base URL is injected at build time via `--dart-define`:

```bash
# Local development (default when no --dart-define is passed)
flutter run --dart-define=API_BASE_URL=http://localhost:3000/api/v1

# Production / staging — pass the deployed URL
flutter run --dart-define=API_BASE_URL=https://<your-deployed-backend>/api/v1
```

When no value is provided, debug builds default to `http://localhost:3000/api/v1`
and release builds fall back to a placeholder that must be overridden.

```bash
dart format .      # formatting
flutter analyze    # static analysis — 0 issues
flutter test       # unit + widget tests (55 passing)
```

## Screens

| Flow | Screen | Highlights |
| --- | --- | --- |
| 1 | **Splash** | Dark-green brand screen; springy logo entrance, session restore |
| 2 | **Sign In / Sign Up** | Real auth via POST /auth/login, error banners, session persistence |
| 3 | **Home Dashboard** | Greeting from user profile, net-balance card, recent groups & activity — all from backend |
| 4 | **Groups** | Live group list, create group, group detail with members/expenses, add expense (equal splits) |
| 5 | **AI Receipt** | Scanned receipt card (UI scaffold — camera/scanner integration TBD) |
| 6 | **Balances** | Group-scoped balances, settle with idempotent POST, SnackBar retry, settlement history |
| 7 | **Activity** | Paginated activity feed with group chips + filter chips (All / Expenses / Settlements) |
| 8 | **Profile** | Live user profile, stats, real sign-out |

## Architecture

```
Presentation (pages / widgets / bottom sheets)
        ↓
Data layer (models / remote data sources / repositories)
        ↓
Core (ApiClient, AuthTokenStore, error mapping, Money utilities)
        ↓
Backend REST API (REST / JSON / Prisma + PostgreSQL)
```

- **Feature-first** folders under `lib/features/<feature>/`.
- **DI** via `get_it` — `configureDependencies()` in `app/di/injection.dart`
  accepts an optional `ApiClient` for test injection.
- **Auth flow** — `AuthController` (ChangeNotifier) manages session state;
  `SplashPage` restores the session; `GoRouter` enforces auth redirects.
- **Money** is stored in integer minor units (`core/utils/money.dart`) —
  formatted as whole PKR; splits use integer arithmetic.
- **Idempotency** — settlement creation sends a client-generated
  `Idempotency-Key` header (8–128 chars); the key is reused on retries.

## Backend Contracts

| Method | Endpoint | Response envelope |
| --- | --- | --- |
| POST | `/auth/register` | `{user, token, refreshToken}` |
| POST | `/auth/login` | `{user, token, refreshToken}` |
| POST | `/auth/refresh` | `{user, token, refreshToken}` (rotates) |
| POST | `/auth/logout` | `{message}` |
| GET | `/auth/me` | `{user}` |
| GET | `/groups` | `{groups: [...]}` |
| POST | `/groups` | `{group: {...}}` |
| GET | `/groups/:id` | `{group: {...}}` |
| POST | `/groups/:id/members` | `{member: {...}}` |
| GET | `/groups/:id/balances` | `{balances: [...]}` |
| POST | `/groups/:id/expenses` | `{expense: {...}}` |
| GET | `/groups/:id/expenses` | `{expenses: [...]}` |
| POST | `/groups/:id/settlements` | `{settlement: {...}}` |
| GET | `/groups/:id/settlements` | `{settlements: [...]}` |
| GET | `/groups/:id/activity?page=&limit=` | `{events: [...]}` + `pagination` |

## Tests

- `test/core/api_client_test.dart` — token attachment, 401 refresh/retry, expiry
- `test/core/api_envelope_test.dart` — envelope unwrap + pagination
- `test/core/api_exception_mapper_test.dart` — HTTP/network error mapping
- `test/core/app_config_test.dart` — default base URL
- `test/core/auth_token_store_test.dart` — session CRUD
- `test/core/idempotency_key_test.dart` — format + uniqueness
- `test/core/money_test.dart` — parsing, arithmetic, split remainder rules
- `test/features/data_contract_test.dart` — data source contracts for all features
- `test/widget/app_smoke_test.dart` — full live flow with fake HTTP backend

## Responsive Design

- **Adaptive layout** — every page renders inside `ResponsiveContent`
  (`core/ui/responsive_content.dart`), which centers content in a 560dp column
  on tablets/desktop while filling phones edge to edge.
- **Width scaling** — `Responsive` derives a scale factor from the 390dp design
  baseline (clamped 0.85–1.25x).
- Verified by a widget test that renders the full flow on a 1000x1000dp
  tablet viewport with zero overflows.

## Project Structure

```text
lib/
├── main.dart
├── app/
│   ├── app.dart                  # MaterialApp.router (theme + router)
│   ├── di/injection.dart         # get_it composition root
│   └── router/app_router.dart    # GoRouter + auth redirect
├── core/
│   ├── config/    # AppConfig (API_BASE_URL)
│   ├── constants/ # AppTextStyles
│   ├── errors/    # AppFailure hierarchy
│   ├── network/   # ApiClient, ApiEnvelope, AuthTokenStore, IdempotencyKey
│   ├── storage/   # LocalStorage (SharedPreferences wrapper)
│   ├── theme/     # colors, spacing, text styles
│   ├── ui/        # reusable widgets + animation primitives
│   └── utils/     # Money, splitEqually
└── features/
    ├── activity/      # data/ (model, datasource, repo) + presentation/
    ├── auth/          # data/ + logic/AuthController + presentation/
    ├── balances/      # data/ + presentation/
    ├── expenses/      # data/ + presentation/
    ├── groups/        # data/ + presentation/
    ├── home/          # presentation/
    ├── profile/       # presentation/
    ├── shell/         # MainShell + HisabHeader
    ├── splash/        # presentation/
    └── receipt/       # presentation/ (UI scaffold)
```

## Known Limitations

- Token storage uses `SharedPreferences` (plain text on disk). The abstraction
  layer (`AuthTokenStore` → `LocalStorage`) is designed for a drop-in swap to
  `flutter_secure_storage` for encrypted at-rest storage on rooted devices.
- The receipt flow is a UI scaffold — camera/scanner integration is TBD.
- Activity creation errors (stderr from get_it) are non-fatal — the catch block
  degrades gracefully in the home page.

# Hisab — Split Bill App

A premium-looking Flutter expense-splitting app: **Hisab** (Urdu for *account / calculation*). The Flutter client connects to the [HisabKitab backend](https://github.com/farehahassan/split-bill-app) via a documented REST API.

## Quick Start

```bash
cd frontend
flutter pub get
flutter run
```

### API Configuration

The backend base URL is injected at build/run time via `--dart-define`:

```bash
# Local development — desktop / iOS Simulator (default when no define is passed)
flutter run --dart-define=API_BASE_URL=http://localhost:3000/api/v1

# Android Emulator (loopback to host machine)
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1

# Production / Staging — pass your deployed URL
flutter run --dart-define=API_BASE_URL=https://<your-deployed-backend>/api/v1
```

- When no value is provided, debug/profile builds default to `http://localhost:3000/api/v1`.
- Release builds throw a `StateError` if `API_BASE_URL` is omitted, failing fast to prevent accidental misconfiguration.
- Timeouts and standard configurations are centralized in `lib/core/config/app_config.dart`.

### Verification & Quality Checks

```bash
dart format .      # formatting
flutter analyze    # static analysis — 0 issues
flutter test       # unit + widget tests (84 passing)
```

## Architecture

```text
Presentation (pages / widgets / bottom sheets / common UI states)
        ↓
Data layer (models / remote data sources / repositories)
        ↓
Core (ApiClient, AuthTokenStore, error mapping, Money utilities, theme)
        ↓
Backend REST API (REST / JSON / Prisma + PostgreSQL)
```

- **Feature-first** organization under `lib/features/<feature>/`.
- **DI** via `get_it` — `configureDependencies()` in `app/di/injection.dart` accepts an optional `ApiClient` and `SecureStorage` for test isolation.
- **Auth flow** — `AuthController` (ChangeNotifier) coordinates session state; `SplashPage` restores the session; `GoRouter` enforces auth guards.
- **Money** is stored in integer minor units (`core/utils/money.dart`) matching backend Prisma `BIGINT` (paisa).
- **Idempotency** — financial mutations send client-generated `Idempotency-Key` headers (8–128 chars).

## Network Layer

The shared `ApiClient` (`lib/core/network/api_client.dart`) handles all HTTP traffic:
- **Methods**: Full support for `GET`, `POST`, `PUT`, `DELETE`, accepting typed JSON bodies, `queryParameters`, and custom `headers`.
- **Authentication**: Automatically attaches `Authorization: Bearer <token>` to protected endpoints; skips credentials for unauthenticated endpoints (`/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`).
- **Safe Retries**: Performs a single transparent token refresh and retry on 401 status for safe read requests (`GET`, `HEAD`). **Mutations are never auto-retried** to guarantee zero duplicate financial transactions.
- **Session Expiration**: Dispatches `onSessionExpired` to clear stored tokens and redirect to sign-in when a refresh fails.
- **Error Mapping**: `mapApiException` normalizes all low-level Dio exceptions and HTTP status codes (`400`, `401`, `403`, `404`, `409`, `422`, `429`, `500+`) into a user-safe `AppFailure` hierarchy, extracting field-level errors (`ApiFieldError`) when present.

## Authentication Infrastructure

- **Token Storage**: Encrypted at rest via `SecureStorage` (`lib/core/storage/secure_storage.dart`) using platform Keychain (iOS) and Keystore (Android), with an in-memory fake for tests.
- **AuthTokenStore** (`lib/core/network/auth_token_store.dart`): Persistent access and refresh token management with `saveSession()`, `readAccessToken()`, `readRefreshToken()`, and `clear()`.
- **Session Restoration**: At launch, `AuthController.restoreSession()` checks for stored credentials, verifies against `GET /auth/me` (refreshing if expired), and smoothly routes to the main app or sign-in without unauthenticated screen flashes.

## Common UI States

Shared, production-grade components matching the Hisab design tokens (`AppColors`, `AppSpacing`, `AppTheme`):
- **`AppLoader`** (`lib/core/ui/app_loader.dart`): Centered circular progress indicator styled in brand primary color with optional status label.
- **`ErrorView`** (`lib/core/ui/error_view.dart`): Centered error state with semantic danger icon, user-safe description, and optional retry action button.
- **`EmptyView`** (`lib/core/ui/empty_view.dart`): Empty placeholder featuring icon, headline, subtitle, and optional custom action button.
- **`AppButton`** (`lib/core/ui/app_button.dart`): Primary action button with built-in loading spinner (`isLoading: true`) that disables duplicate taps and respects disabled styling (`onPressed: null`).

## Backend Models

Strongly typed Dart models matching backend schema contracts with `fromJson`, `toJson`, `copyWith`, and equality:

| Model | File Location | Key Responsibilities |
| --- | --- | --- |
| **`User`** | `lib/features/auth/data/models/user.dart` | User identity (`id`, `name`, `email`, `initials`). Backwards-compatible with `UserProfile`. |
| **`Group`** | `lib/features/groups/data/models/group.dart` | Bill-splitting group (`id`, `name`, `createdById`, `memberCount`, timestamps). Includes `GroupDetail` and `GroupSummary`. |
| **`GroupMember`** | `lib/features/groups/data/models/group.dart` | Group participant reference (`id`, `name`, `email`) and `GroupMemberRecord`. |
| **`Expense`** | `lib/features/expenses/data/models/expense.dart` | Expense record with integer minor-unit amount, payer, splits list, and `Money` getter. Includes `ExpenseDetail` and `ExpenseSummary`. |
| **`ExpenseSplit`** | `lib/features/expenses/data/models/expense.dart` | Individual participant share of an expense. |
| **`Balance`** | `lib/features/settlements/data/models/balance.dart` | Member net balance within a group with `isCreditor`, `isDebtor`, and `isSettled` flags. Compatible with `GroupBalance`. |
| **`Settlement`** | `lib/features/settlements/data/models/settlement.dart` | Payer-to-payee debt settlement with idempotency payload support. |
| **`ActivityEvent`** | `lib/features/activity/data/models/activity_event.dart` | Auditable activity feed item with timestamps, user info, event type checks, and pagination models. |

A domain barrel export is available at `lib/core/models/models.dart`.

## Mock Data

Mock definitions are isolated in `lib/mock/mock_data.dart` and serve standalone UI demonstration/previews (e.g. receipt scanning scaffold) without interfering with real backend integration layers.

## Tests

The project includes 84 automated unit and widget tests covering:
- `test/core/api_client_test.dart` — Token attachment, safe GET 401 refresh/retry, mutation non-retry, PUT/DELETE methods, custom headers.
- `test/core/backend_models_test.dart` — Serialization, deserialization, copyWith, and equality for all 8 backend models.
- `test/core/common_ui_states_test.dart` — Rendering and interaction for `AppLoader`, `ErrorView`, `EmptyView`, and `AppButton`.
- `test/core/api_envelope_test.dart` — Response envelope unwrapping and pagination extraction.
- `test/core/api_exception_mapper_test.dart` — Network and HTTP error mapping to user-safe `AppFailure`s.
- `test/core/app_config_test.dart` — Environment base URL configuration and validation.
- `test/core/auth_token_store_test.dart` — Secure token session persistence, reading, and clearing.
- `test/core/idempotency_key_test.dart` — Idempotency key format, charset, and uniqueness.
- `test/core/money_test.dart` — Money minor-unit parsing, integer arithmetic, and split remainder rules.
- `test/features/data_contract_test.dart` — Remote data source contracts for all core features against backend routes.
- `test/widget/app_smoke_test.dart` — End-to-end user navigation flow across phone and tablet viewports with mock HTTP adapter.

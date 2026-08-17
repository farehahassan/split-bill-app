# Flutter + Bloc/Cubit — Production Feature Development Playbook

A reusable project-level guide for maintainable Flutter applications using Bloc/Cubit. It covers architecture, API integration, state, authentication, forms, pagination, uploads, testing, AI coding workflows, and feature documentation.

## 1. Core Principles

- Separate presentation, logic, and data responsibilities.
- Use unidirectional data flow.
- Keep widgets lean; no API/business logic in `build()`.
- Use repositories as the application's data boundary/source of truth.
- Prefer immutable, typed state.
- Use Cubit by default; use Bloc when explicit event-driven behavior adds value.
- Add a domain/use-case layer only when logic is complex, combines repositories, or is reused.
- Prefer the simplest architecture that solves the problem.

Flutter's current architecture guidance emphasizes separation of concerns, repositories, lean UI, unidirectional data flow, and testability. It explicitly treats the domain layer as optional. [Flutter architecture](https://docs.flutter.dev/app-architecture/guide)

## 2. Architecture

```text
Presentation
     ↓
Cubit / State
     ↓
Repository
     ↓
Data Source / Service
     ↓
API / Local Storage / Platform
```

For complex features:

```text
Presentation → Cubit → Use Case/Domain → Repository → Data Source → External System
```

## 3. Feature-First Structure

```text
lib/
├── app/
│   ├── app.dart
│   ├── router/
│   └── di/
├── core/
│   ├── constants/
│   ├── errors/
│   ├── extensions/
│   ├── network/
│   ├── storage/
│   ├── theme/
│   ├── utils/
│   └── ui/
├── features/
│   └── <feature>/
│       ├── data/
│       │   ├── datasources/
│       │   ├── models/
│       │   └── repositories/
│       ├── logic/
│       │   ├── cubit/
│       │   └── states/
│       └── presentation/
│           ├── pages/
│           ├── widgets/
│           └── dialogs/
└── main.dart
```

Keep feature-specific code inside its feature. Shared infrastructure belongs in `core`.

## 4. Layer Responsibilities

### Presentation
Pages, widgets, forms, dialogs, bottom sheets, and UI-only helpers. It may read Cubit state and trigger Cubit methods. It should not know HTTP implementation, token storage, or database details.

### Logic
Cubits and states. Coordinates feature behavior and transforms repository data for presentation when necessary.

### Data
Models, request/response DTOs, repositories, remote/local data sources, and API mapping.

### Repository
The application-facing data boundary. It can handle caching, retry, refresh, synchronization, and error mapping when those concerns belong to the data layer.

### Data Source / Service
Wrap external systems such as REST APIs, databases, files, or platform plugins. Keep low-level external-system details here.

## 5. Cubit vs Bloc

Use Cubit for normal feature commands:

```dart
loadExpenses();
createExpense();
updateExpense();
deleteExpense();
refresh();
retry();
```

Use full Bloc when explicit events, event transformation, or complex event-driven state transitions provide meaningful value.

Do not introduce Bloc simply because a feature is important.

## 6. State Design

Prefer immutable, typed state:

```dart
class ExpenseState {
  final bool isInitialLoading;
  final bool isRefreshing;
  final bool isSubmitting;
  final List<ExpenseModel> expenses;
  final String? errorMessage;

  const ExpenseState({
    this.isInitialLoading = false,
    this.isRefreshing = false,
    this.isSubmitting = false,
    this.expenses = const [],
    this.errorMessage,
  });

  ExpenseState copyWith({
    bool? isInitialLoading,
    bool? isRefreshing,
    bool? isSubmitting,
    List<ExpenseModel>? expenses,
    String? errorMessage,
  }) => ExpenseState(
    isInitialLoading: isInitialLoading ?? this.isInitialLoading,
    isRefreshing: isRefreshing ?? this.isRefreshing,
    isSubmitting: isSubmitting ?? this.isSubmitting,
    expenses: expenses ?? this.expenses,
    errorMessage: errorMessage,
  );
}
```

Use explicit states when they improve clarity, e.g. `Initial`, `Loading`, `Loaded`, `Submitting`, `Success`, `Failure`.

Do not use `dynamic` when a real type is practical. Do not keep multiple competing copies of the same server data.

## 7. Loading and Refresh

Do not erase useful content during refresh.

```text
Existing data
    ↓
isRefreshing = true
    ↓
Fetch latest
    ↓
Replace data
    ↓
isRefreshing = false
```

Use separate flags for independent operations: `isInitialLoading`, `isRefreshing`, `isSubmitting`, `isLoadingMore`.

Never start network requests from `build()`.

## 8. Cubit Rules

Cubit should:
- Receive commands from UI.
- Call repositories.
- Transform data needed by UI.
- Emit state.
- Coordinate loading/success/failure.

Cubit should not:
- Build widgets.
- Know API URLs.
- Construct raw HTTP requests.
- Directly manage secure tokens.
- Depend on `BuildContext`.
- Show SnackBars/dialogs directly.
- Contain database/network infrastructure.

## 9. Repository Pattern

Prefer abstract repositories:

```dart
abstract class ExpenseRepository {
  Future<List<ExpenseModel>> getExpenses(String groupId);
  Future<ExpenseModel> createExpense(CreateExpenseRequest request);
}
```

Concrete implementation:

```dart
class ExpenseRepositoryImpl implements ExpenseRepository {
  final ExpenseRemoteDataSource remoteDataSource;

  ExpenseRepositoryImpl(this.remoteDataSource);

  @override
  Future<List<ExpenseModel>> getExpenses(String groupId) =>
      remoteDataSource.getExpenses(groupId);

  @override
  Future<ExpenseModel> createExpense(CreateExpenseRequest request) =>
      remoteDataSource.createExpense(request);
}
```

Abstract repositories improve testability and make alternate implementations easier.

## 10. API Client

Use one shared API client for common networking behavior:
- Base URL
- Timeouts
- Common headers
- Authentication headers
- Request execution
- Response normalization
- Low-level network errors

Do not instantiate and configure a new HTTP client inside every feature.

Feature data sources should use the shared client.

## 11. API Error Handling

Normalize low-level errors into application-level failures:

```dart
sealed class AppFailure {
  const AppFailure();
}

class NetworkFailure extends AppFailure {
  final String message;
  const NetworkFailure(this.message);
}

class UnauthorizedFailure extends AppFailure {
  const UnauthorizedFailure();
}

class ValidationFailure extends AppFailure {
  final String message;
  const ValidationFailure(this.message);
}

class ServerFailure extends AppFailure {
  final String message;
  const ServerFailure(this.message);
}
```

Handle common HTTP outcomes intentionally:

```text
200/201/204 → success
400         → bad request
401         → unauthenticated
403         → forbidden
404         → not found
409         → conflict
422         → validation
429         → rate limited
500+        → server failure
```

Never expose raw Dio/HTTP/stack-trace messages to users.

## 12. Authentication

```text
App Launch
    ↓
AuthCubit
    ↓
Check session/token
    ↓
Authenticated?
   ↙       ↘
 YES       NO
  ↓         ↓
Home      Login
```

Responsibilities:
- AuthCubit: auth state and commands.
- AuthRepository: login, signup, Google Sign-In, logout, session retrieval.
- Secure storage: sensitive tokens/credentials.
- API client: attach tokens and centrally handle unauthorized responses.

Rules:
- Never hardcode tokens.
- Never commit secrets.
- Never print tokens in logs.
- Clear session data on logout.
- Centralize refresh-token behavior if refresh tokens are used.

## 13. Forms

```text
User input
    ↓
Local validation
    ↓
Cubit submit
    ↓
Repository
    ↓
API
    ↓
Success / Failure
```

Validate before network calls. Protect against duplicate submissions. Handle required fields, formatting, numeric constraints, file validation, and server validation errors.

## 14. Duplicate Requests

For login, create, update, delete, settlement, etc.:

```text
Idle → Submitting → Success/Failure
```

If `isSubmitting` is already true, ignore or disable repeated submission.

Avoid duplicate list requests caused by rebuilds.

## 15. Pagination

Maintain separate pagination state:

```text
Page 1
 ↓
Append
 ↓
Scroll
 ↓
Page 2
 ↓
Append
 ↓
hasMore = false
```

Track page/cursor, `hasMore`, and `isLoadingMore`. Do not replace existing items during load-more. Prevent duplicate page requests. Prefer cursor pagination when appropriate for highly dynamic data.

## 16. Optimistic Updates

Use only when rollback is well-defined and the UX benefit is meaningful.

```text
User action
 ↓
Update UI immediately
 ↓
API
 ↙   ↘
OK   Failure
 ↓      ↓
Keep   Rollback
```

Be especially conservative with financial operations.

## 17. File/Image Uploads

```text
Pick image
 ↓
Validate
 ↓
Compress if appropriate
 ↓
Upload
 ↓
Process
 ↓
Result
```

Handle permissions, cancellation, file type/size, upload failure, timeout, and retry.

For AI receipt scanning:

```text
Camera/Gallery
 ↓
Validation
 ↓
Upload
 ↓
AI processing
 ↓
Parsed result
 ↓
User review/edit
 ↓
Item assignment
 ↓
Expense creation
```

Never silently trust AI-generated financial data.

## 18. BlocBuilder / BlocListener / BlocConsumer

Use `BlocBuilder` to rebuild UI.

Use `BlocListener` for one-time effects such as navigation, dialogs, and SnackBars.

Use `BlocConsumer` only when both are genuinely needed. Do not default every screen to `BlocConsumer`.

Cubit should not navigate directly using `BuildContext`.

## 19. Navigation

Prefer:

```text
Cubit emits state
      ↓
BlocListener
      ↓
Router/navigation
```

Keep navigation decisions in the UI/router layer.

## 20. Models / DTOs

For larger APIs, separate transport DTOs from application/domain models:

```text
API JSON
 ↓
DTO
 ↓
Repository mapping
 ↓
Application model
 ↓
Cubit
 ↓
UI
```

For small features, one typed model may be sufficient. Do not create duplicate model layers without a reason.

## 21. Business Logic

Simple feature logic can live in Cubit.

Create a use case/domain service when logic:
- Combines multiple repositories.
- Is complex enough to obscure the Cubit.
- Is reused across multiple features.

Do not create use cases for trivial one-line repository calls.

## 22. Financial Calculations

For money-related applications:
- Do not calculate from formatted UI strings.
- Make rounding rules explicit.
- Prefer integer minor units or an appropriate decimal strategy when exact currency precision matters.
- Test rounding and split edge cases.

Example:

```text
PKR 1000 / 3
→ PKR 333
→ PKR 333
→ PKR 334
```

The remainder must be handled intentionally, not accidentally by floating-point arithmetic.

## 23. Reusable Components

Create components for genuinely repeated patterns:

```text
AppButton
AppTextField
AppLoader
ErrorView
EmptyView
AmountText
MemberAvatar
ExpenseTile
GroupCard
AppBottomSheet
AppDialog
```

Avoid both duplication and over-abstraction.

## 24. Theme / Design System

Centralize colors, typography, spacing, radii, shadows, button styles, and input styles.

Use semantic tokens where helpful:

```text
spacingSmall
spacingMedium
spacingLarge
radiusSmall
radiusMedium
radiusLarge
```

## 25. Accessibility

Consider:
- Readable text
- Strong contrast
- Semantic labels
- Adequate touch targets
- Text scaling
- Screen readers where relevant
- Status indicators that do not rely on color alone

## 26. Async / Lifecycle Safety

- Do not update disposed UI objects.
- After `await`, verify widget lifecycle when using `BuildContext`/State.
- Cancel subscriptions when appropriate.
- Close Cubits/Blocs according to ownership.
- Dispose controllers, focus nodes, animations, and streams where required.

## 27. Dependency Injection

Use one consistent composition strategy:

```text
App startup
 ↓
Dependencies
 ↓
API client
 ↓
Data sources
 ↓
Repositories
 ↓
Cubits
 ↓
Pages
```

Do not construct complex dependency graphs inside random widgets.

## 28. Environments

Support environment separation when needed:

```text
development
staging
production
```

Keep base URLs and environment-specific configuration outside feature code. Never commit private secrets.

## 29. Logging

Logs should help debugging without exposing sensitive information.

Never log:
- Passwords
- Access tokens
- Refresh tokens
- Payment credentials
- Sensitive personal information

Remove noisy debug logging from production builds where appropriate.

## 30. Testing Strategy

Test architecture components separately and together.

### Unit tests
- Cubits
- Repositories
- Services
- Calculations
- Validators
- Mappers

### Widget tests
- Loading
- Empty
- Error
- Validation
- Buttons
- State-driven rendering

### Integration tests
Focus on critical user flows:

```text
Login
Create group
Add expense
Scan receipt
Assign items
View balance
Settle expense
```

## 31. Feature Development Workflow

### Step 1 — Inspect
Read the existing architecture, similar features, reusable widgets, API client, repositories, and Cubit patterns.

### Step 2 — Define
Document goal, user flow, screens, states, APIs, models, validation, errors, and edge cases.

### Step 3 — Design
Confirm loading, empty, error, success, disabled, permission, and retry states.

### Step 4 — Data
Implement models → data source → repository.

### Step 5 — Logic
Implement state → Cubit.

### Step 6 — UI
Implement page → widgets → BlocProvider → BlocBuilder/Listener.

### Step 7 — Integrate
Test against the real backend/API.

### Step 8 — Test
Run appropriate unit/widget/integration tests.

### Step 9 — Quality
Run:

```bash
dart format .
flutter analyze
flutter test
```

### Step 10 — Review
Check architecture, duplication, secrets, error handling, analyzer output, and unrelated changes.

## 32. AI Coding Assistant Rules

When using Freebuff or another AI coding assistant:

1. Inspect before modifying.
2. Explain the implementation plan.
3. Identify reusable code.
4. List files to create/change.
5. Implement only the requested feature.
6. Follow existing architecture.
7. Run/analyze the code.
8. Fix compilation/analyzer issues.
9. Summarize changes.

### Standard Prompt

```text
Implement only the requested feature.

Before changing anything:
1. Inspect the existing project structure.
2. Identify the current Flutter architecture.
3. Identify existing Cubits/Blocs.
4. Identify existing repositories and data sources.
5. Identify reusable widgets and theme components.
6. Identify the existing API client and error handling.
7. Find a similar existing feature and follow its conventions.

Architecture requirements:
- Flutter
- Bloc/Cubit for state management
- Feature-first organization
- UI → Cubit → Repository → Data Source → API
- Immutable typed state
- Repository as the data boundary
- No API calls inside widgets
- No navigation inside repositories/Cubits
- No tokens inside UI code
- Reuse existing infrastructure
- Do not introduce a new architecture

Implementation:
1. Explain the plan briefly.
2. List files to create.
3. List files to modify.
4. Implement the feature.
5. Handle loading, empty, error, success, and validation states.
6. Prevent duplicate submissions where relevant.
7. Keep unrelated files unchanged.
8. Run formatting/analyzer/tests where available.
9. Fix issues found.

After implementation report:
- Files created
- Files modified
- API endpoints used
- Dependencies added
- Architecture decisions
- Assumptions
- Tests performed
- Remaining issues
```

## 33. AI Coding — Never Do This

```text
❌ API calls inside widgets
❌ Navigation inside repositories
❌ BuildContext inside repositories/data sources
❌ Tokens in UI code
❌ New API clients per feature
❌ Duplicate existing widgets/infrastructure
❌ New state-management pattern for one feature
❌ Unrelated file changes
❌ Rewriting working infrastructure without reason
❌ Unnecessary dynamic types
❌ Silently swallowed exceptions
❌ Raw technical exceptions shown to users
❌ Hardcoded secrets
❌ Blindly trusting AI-generated financial data
❌ Unnecessary use cases/services
❌ Business calculations inside UI widgets
❌ Network calls from build()
❌ Duplicate form submissions
❌ Undefined loading/empty/error states
```

## 34. Definition of Done

### Architecture
- [ ] Correct feature folder
- [ ] Correct layer boundaries
- [ ] Existing patterns reused

### Data
- [ ] Models
- [ ] Request models where needed
- [ ] Data source
- [ ] Repository
- [ ] Error mapping

### Logic
- [ ] Cubit/state
- [ ] Loading
- [ ] Success
- [ ] Failure
- [ ] Empty
- [ ] Refresh/retry where relevant
- [ ] Duplicate submission protection

### UI
- [ ] Page
- [ ] Reusable widgets
- [ ] Validation
- [ ] Loading UI
- [ ] Empty UI
- [ ] Error UI
- [ ] Success feedback
- [ ] Accessibility considerations

### Integration
- [ ] Real API tested
- [ ] Auth tested
- [ ] Network failure tested
- [ ] Edge cases tested

### Quality
- [ ] `dart format .`
- [ ] `flutter analyze`
- [ ] `flutter test`
- [ ] No secrets committed
- [ ] No unrelated files changed
- [ ] No known analyzer errors
- [ ] No raw exceptions exposed to users

## 35. Feature Documentation Template

Every major feature should have an MD with:

```markdown
# Feature Name

## Purpose

## User Flow

## Screens

## UI States

## API Endpoints

## Models

## Validation Rules

## Cubit Responsibilities

## Repository Responsibilities

## Data Source Responsibilities

## Error Cases

## Edge Cases

## Testing Checklist

## Files

### Create

### Modify

## Definition of Done
```

## 36. Example Feature Structure

```text
features/groups/
├── data/
│   ├── datasources/
│   │   └── groups_remote_data_source.dart
│   ├── models/
│   │   ├── group_model.dart
│   │   ├── create_group_request.dart
│   │   └── join_group_request.dart
│   └── repositories/
│       ├── groups_repository.dart
│       └── groups_repository_impl.dart
├── logic/
│   ├── cubit/
│   │   └── groups_cubit.dart
│   └── states/
│       └── groups_state.dart
└── presentation/
    ├── pages/
    │   ├── groups_page.dart
    │   ├── create_group_page.dart
    │   └── join_group_page.dart
    └── widgets/
        ├── group_card.dart
        └── member_avatar.dart
```

## 37. Final Reference

Normal feature:

```text
┌──────────────────────────┐
│      Presentation        │
│ Pages / Widgets / Forms  │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│      Cubit / State       │
│ UI state + coordination  │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│       Repository         │
│ Source of truth / data   │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ Data Source / Service    │
│ API / DB / Platform      │
└────────────┬─────────────┘
             │
             ▼
       External System
```

## 38. Best-Practice Sources

This playbook was expanded using current official Flutter/Dart guidance, especially:

- Flutter app architecture: https://docs.flutter.dev/app-architecture/guide
- Flutter architecture recommendations: https://docs.flutter.dev/app-architecture/recommendations
- Flutter architecture concepts: https://docs.flutter.dev/app-architecture/concepts
- Flutter data-layer case study: https://docs.flutter.dev/app-architecture/case-study/data-layer
- Flutter architecture design patterns: https://docs.flutter.dev/app-architecture/design-patterns
- Effective Dart: https://dart.dev/effective-dart
- Effective Dart style: https://dart.dev/effective-dart/style

These sources emphasize separation of concerns, repositories, single sources of truth, unidirectional data flow, testability, appropriate abstraction, and consistent Dart style. Flutter also explicitly notes that architecture recommendations are guidelines to adapt to project requirements rather than rigid rules.

Last reviewed: August 2026.

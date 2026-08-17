# Hisab — Split Bill App

A premium-looking Flutter expense-splitting app UI: **Hisab** (Urdu for
*account / calculation*). This build is a fully interactive **UI showcase** —
every screen from the design is implemented with rich mock data and
animations. Nothing is wired to a backend yet; all data lives in
[`lib/mock/mock_data.dart`](lib/mock/mock_data.dart).

## Quick Start

```bash
flutter pub get
flutter run        # pick a device (android / ios / web / windows)
```

```bash
dart format .      # formatting
flutter analyze    # static analysis
flutter test       # unit + widget tests (21 passing)
```

## The Screens

| Flow | Screen | Highlights |
| --- | --- | --- |
| 1 | **Splash** | Dark-green brand screen; springy logo entrance, auto-advances |
| 2 | **Sign In** | Staggered entrance, email/password validation, show/hide password, fake Google button, loading → home |
| 3 | **Home Dashboard** | Greeting header, net-balance card with animated counters, Scan / Add actions, recent groups & activity |
| 4 | **Groups** | Create Group / Join Group bottom sheets, active-groups list with owe/owed badges, group detail sheet |
| 5 | **AI Receipt** | Scanned receipt card, total bill, tap-to-assign items to people, Split All, confirm flow with success state |
| 6 | **Balances & Settlements** | You Owe / You Are Owed cards, friends list with working Settle flow, link to full activity feed |
| 7 | **Activity** | Transactions grouped by date with working filter chips and detail sheets |
| 8 | **Profile** | User card, stats, settings with live switch, sign out |

The shell uses a custom bottom navigation bar with a prominent center
**Add** button that pushes the receipt flow.

## Responsive Design

- **Adaptive layout** — every page renders inside `ResponsiveContent`
  (`core/ui/responsive_content.dart`), which centers content in a 560dp column
  on tablets/desktop while filling phones edge to edge.
- **Width scaling** — `Responsive` (`core/utils/responsive.dart`) derives a
  scale factor from the 390dp design baseline and applies it to page padding,
  chips, and key component sizes (clamped 0.85–1.25×).
- **Window size classes** — `isCompact` (<600dp) / `isMedium` / `isExpanded`
  (≥840dp) follow Material 3 guidance for future adaptive layouts.
- **Accessible text** — system text scaling is respected up to 1.3× so the
  layout never breaks at extreme accessibility settings.
- Verified by a widget test that renders the full flow on a 1000×1000dp
  tablet viewport with zero overflows.

## Animations

- **Entrance** — reusable staggered fade + slide-up (`core/ui/entrance.dart`)
- **PressableScale** — tactile press-down + springy release on every card/button
- **AnimatedMoneyText** — amounts count up on load and re-target when they change
- **Tab switching** — cross-fade + slide in the shell
- **Route transitions** — soft fade + slide-up on every push
- **Micro-interactions** — animated selection chips, checkmark badges, gradient FAB,
  success states on confirm/settle, animated amount changes after settling

## Architecture

```
Presentation (pages / widgets / bottom sheets)
        ↓
Mock data (lib/mock/mock_data.dart — typed, immutable seed data)
        ↓
core/ (theme tokens, reusable UI widgets, Money utilities, errors)
```

- **Feature-first** folders under `lib/features/<screen>/presentation/`.
- **Money** is stored in integer minor units (`core/utils/money.dart`) and
  formatted as whole PKR, e.g. `PKR 1,250` / `-PKR 1,250`; splits use integer
  arithmetic with explicit remainder handling.
- **Theme** tokens live in `core/theme/` (colors, spacing, radii, text styles)
  and are centralized in `AppTheme.light` — change one value to re-skin.
- Reusable UI lives in `core/ui/` (`AppButton`, `AppTextField`, `AppLogo`,
  `Entrance`, `PressableScale`, `AnimatedMoneyText`, …).
- Playbook: [`docs/playbook.md`](docs/playbook.md) (kept from the original
  production setup; shared `ApiClient`, `AppFailure` errors and `LocalStorage`
  remain in `core/` for when a backend is added).

## Project Structure

```text
lib/
├── main.dart
├── app/
│   ├── app.dart                  # MaterialApp.router (theme + router)
│   ├── di/injection.dart         # shared infra (ApiClient, LocalStorage)
│   └── router/app_router.dart    # routes + fade-slide transitions
├── core/
│   ├── constants/  errors/  network/  storage/
│   ├── theme/      # colors, spacing, text styles, theme
│   ├── ui/         # reusable widgets + animation primitives
│   └── utils/      # Money, splitEqually
├── mock/
│   └── mock_data.dart            # all showcase data + models
└── features/
    ├── splash/     auth/    shell/    home/    groups/
    ├── receipt/    balances/         activity/  profile/
    └── (each: presentation/pages + widgets)
```

## Tests

- `test/core/money_test.dart` — parsing, arithmetic, split remainder rules
  (e.g. PKR 1000 / 3 → 334 / 333 / 333).
- `test/core/api_exception_mapper_test.dart` — HTTP/network error mapping.
- `test/widget/app_smoke_test.dart` — full flow: splash → sign in → home,
  plus bottom-nav tab switching.

## Roadmap Ideas

- Wire the receipt screen to real camera/gallery scanning (see playbook §17).
- Replace mock data with a backend via the shared `ApiClient` (playbook §10).
- Auth with secure token storage behind the sign-in screen.
- Settlements that actually zero out balances across friends.

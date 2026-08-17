# Hisab UI Showcase

## Purpose

A pixel-faithful, fully animated implementation of the Hisab split-bill app
designs. Every screen is interactive and populated with realistic mock data —
no backend, no dynamic business logic. It serves as the visual foundation for
the product and a reference for wiring real features later.

## User Flow

1. Splash (dark green, animated logo) → auto-advances.
2. Sign In (email + password validation, Google button) → mocked auth → shell.
3. Shell tabs: Home, Groups, Activity (balances), Profile + center Add button.
4. Add / Scan Receipt → AI receipt screen: tap items to assign, Split All,
   Confirm Split.
5. Balances tab → settle with a friend → link to the full activity feed.

## Screens

- `SplashPage`
- `SignInPage`
- `MainShell` (custom bottom nav + center FAB)
- `HomePage`
- `GroupsPage`
- `ReceiptPage`
- `BalancesPage`
- `ActivityPage` (pushed from Balances)
- `ProfilePage`

## UI States

- Splash: entrance animation, then navigation (no user action).
- Sign In: field validation errors, button loading state.
- Lists: entrance animations; always rendered from mock data (no empty/error
  states needed in the showcase).
- Receipt: unassigned-item warning, person selection, split-all mode,
  confirm → success state.
- Balances: settle bottom sheet → friend marked settled, summary cards
  animate to new totals.

## Models (lib/mock/mock_data.dart)

- `UserProfile`, `MockGroup`, `MockActivity`, `MockFriend`, `ReceiptItem`,
  `ReceiptPerson` — all immutable, const-constructible seed data.
- Amounts are `Money` (integer minor units), formatted as whole PKR.

## Validation Rules (Sign In)

- Email must be non-empty and contain `@`.
- Password must be non-empty.

## Animations

- `Entrance` (staggered fade + slide-up), `PressableScale` (press feedback),
  `AnimatedMoneyText` (count-up), animated tab switcher, custom route
  transitions, animated chips/selection, success states.

## Testing Checklist

- [ ] Splash appears and auto-navigates
- [ ] Sign-in validation works; loading then home
- [ ] Bottom nav switches Home / Groups / Activity / Profile
- [ ] Add button opens the receipt screen
- [ ] Receipt items assign/unassign; Split All; Confirm Split success
- [ ] Settle flow updates friend + summary cards
- [ ] Activity filters (paid / received / settlements) work
- [ ] `dart format .` clean
- [ ] `flutter analyze` clean
- [ ] `flutter test` green

## Files

### Create

- `lib/mock/mock_data.dart`
- `lib/features/splash/presentation/pages/splash_page.dart`
- `lib/features/auth/presentation/pages/sign_in_page.dart`
- `lib/features/shell/presentation/main_shell.dart`
- `lib/features/shell/presentation/widgets/hisab_bottom_nav.dart`
- `lib/features/shell/presentation/widgets/hisab_header.dart`
- `lib/features/home/presentation/pages/home_page.dart`
- `lib/features/groups/presentation/pages/groups_page.dart`
- `lib/features/receipt/presentation/pages/receipt_page.dart`
- `lib/features/balances/presentation/pages/balances_page.dart`
- `lib/features/activity/presentation/pages/activity_page.dart`
- `lib/features/profile/presentation/pages/profile_page.dart`
- `lib/core/ui/entrance.dart`, `pressable_scale.dart`,
  `animated_money_text.dart`, `app_logo.dart`
- `test/widget/app_smoke_test.dart`

### Modify

- `lib/app/app.dart`, `lib/app/router/app_router.dart`
- `lib/core/theme/*` (Hisab dark-green palette)
- `lib/core/constants/app_constants.dart`, `lib/core/utils/money.dart`
- `README.md`

## Definition of Done

- [ ] All design frames implemented
- [ ] Mock data present everywhere, nothing dynamic
- [ ] Animations throughout (entrance, press, counters, transitions)
- [ ] `dart format .` clean
- [ ] `flutter analyze` clean
- [ ] `flutter test` green

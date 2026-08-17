import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:split_bill_app/app/app.dart';
import 'package:split_bill_app/app/router/app_router.dart';

/// Pumps until all finite entrance animations and staggered delays finish.
Future<void> settleAnimations(WidgetTester tester) async {
  await tester.pumpAndSettle();
  await tester.pump(const Duration(seconds: 1));
  await tester.pumpAndSettle();
}

Future<void> signIn(WidgetTester tester) async {
  await tester.enterText(find.byType(TextField).first, 'ahmed@example.com');
  await tester.enterText(find.byType(TextField).at(1), 'secret123');
  await tester.ensureVisible(find.text('Sign In'));
  await tester.tap(find.text('Sign In'));
  await tester.pump(const Duration(milliseconds: 1500));
  await settleAnimations(tester);
}

void main() {
  testWidgets('splash → sign in → home dashboard', (tester) async {
    await tester.pumpWidget(SplitBillApp(router: createAppRouter()));

    // Splash with animated logo.
    expect(find.text('Hisab'), findsOneWidget);
    expect(find.text('Keep your splits clear.'), findsOneWidget);

    // Advance past the splash auto-navigation timer.
    await tester.pump(const Duration(milliseconds: 2500));
    await settleAnimations(tester);

    // Sign-in screen.
    expect(find.text('Welcome back. Keep your splits clear.'), findsOneWidget);
    expect(find.text('Sign In'), findsOneWidget);

    await signIn(tester);

    // Home dashboard with mock data.
    expect(find.text('NET BALANCE'), findsOneWidget);
    expect(find.text('Recent Groups'), findsOneWidget);
    expect(find.text('Trip to Naran'), findsOneWidget);
  });

  testWidgets('bottom navigation switches between tabs', (tester) async {
    await tester.pumpWidget(SplitBillApp(router: createAppRouter()));
    await tester.pump(const Duration(milliseconds: 2500));
    await settleAnimations(tester);
    await signIn(tester);

    // Groups tab.
    await tester.tap(find.text('Groups'));
    await settleAnimations(tester);
    expect(find.text('Active Groups'), findsOneWidget);
    expect(find.text('Create Group'), findsOneWidget);

    // Activity tab shows balances & settlements.
    await tester.tap(find.text('Activity'));
    await settleAnimations(tester);
    expect(find.text('Balances'), findsOneWidget);
    expect(find.text('Friends'), findsOneWidget);
    expect(find.text('Ali Raza'), findsOneWidget);
  });

  testWidgets('renders without overflow on a tablet-sized screen', (
    tester,
  ) async {
    // Logical 1000x1000dp (expanded layout) — content must stay centered
    // in the max-width column and never overflow.
    tester.view.physicalSize = const Size(2000, 2000);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(SplitBillApp(router: createAppRouter()));
    await tester.pump(const Duration(milliseconds: 2500));
    await settleAnimations(tester);
    await signIn(tester);

    expect(find.text('NET BALANCE'), findsOneWidget);
    expect(find.text('Trip to Naran'), findsOneWidget);

    // Receipt flow on a wide screen.
    await tester.tap(find.text('Scan Receipt'));
    await settleAnimations(tester);
    expect(find.text('TOTAL BILL'), findsOneWidget);

    // The itemized list is long — scroll to the footer actions.
    await tester.dragUntilVisible(
      find.text('Confirm Split'),
      find.byType(ListView).first,
      const Offset(0, -300),
    );
    await settleAnimations(tester);
    expect(find.text('Confirm Split'), findsOneWidget);
    expect(find.text('Edit Receipt'), findsOneWidget);
  });
}

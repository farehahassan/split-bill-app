import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:split_bill_app/core/ui/app_button.dart';
import 'package:split_bill_app/core/ui/app_loader.dart';
import 'package:split_bill_app/core/ui/empty_view.dart';
import 'package:split_bill_app/core/ui/error_view.dart';

void main() {
  Widget wrapWidget(Widget child) {
    return MaterialApp(
      home: Scaffold(body: child),
    );
  }

  group('AppLoader', () {
    testWidgets('renders spinner without label', (tester) async {
      await tester.pumpWidget(wrapWidget(const AppLoader()));

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.byType(Text), findsNothing);
    });

    testWidgets('renders spinner with custom label', (tester) async {
      await tester.pumpWidget(
        wrapWidget(const AppLoader(label: 'Loading balances...')),
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Loading balances...'), findsOneWidget);
    });
  });

  group('ErrorView', () {
    testWidgets('renders error message and icon without retry', (tester) async {
      await tester.pumpWidget(
        wrapWidget(const ErrorView(message: 'Failed to load details')),
      );

      expect(find.byIcon(Icons.error_outline), findsOneWidget);
      expect(find.text('Failed to load details'), findsOneWidget);
      expect(find.byType(AppButton), findsNothing);
    });

    testWidgets('renders retry button and triggers callback on tap',
        (tester) async {
      var retried = false;
      await tester.pumpWidget(
        wrapWidget(
          ErrorView(
            message: 'Network error',
            onRetry: () => retried = true,
          ),
        ),
      );

      expect(find.text('Network error'), findsOneWidget);
      final retryFinder = find.widgetWithText(AppButton, 'Retry');
      expect(retryFinder, findsOneWidget);

      await tester.tap(retryFinder);
      await tester.pump();

      expect(retried, isTrue);
    });
  });

  group('EmptyView', () {
    testWidgets('renders icon, title, subtitle and optional action',
        (tester) async {
      var actionTapped = false;
      await tester.pumpWidget(
        wrapWidget(
          EmptyView(
            icon: Icons.group_outlined,
            title: 'No groups yet',
            subtitle: 'Create a group to start splitting',
            action: ElevatedButton(
              onPressed: () => actionTapped = true,
              child: const Text('Create Group'),
            ),
          ),
        ),
      );

      expect(find.byIcon(Icons.group_outlined), findsOneWidget);
      expect(find.text('No groups yet'), findsOneWidget);
      expect(find.text('Create a group to start splitting'), findsOneWidget);
      expect(find.text('Create Group'), findsOneWidget);

      await tester.tap(find.text('Create Group'));
      await tester.pump();
      expect(actionTapped, isTrue);
    });
  });

  group('AppButton', () {
    testWidgets('calls onPressed when enabled and tapped', (tester) async {
      var tapped = false;
      await tester.pumpWidget(
        wrapWidget(
          AppButton(
            label: 'Submit',
            onPressed: () => tapped = true,
          ),
        ),
      );

      expect(find.text('Submit'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);

      await tester.tap(find.byType(AppButton));
      await tester.pump();
      expect(tapped, isTrue);
    });

    testWidgets('renders spinner and ignores taps when isLoading is true',
        (tester) async {
      var tapped = false;
      await tester.pumpWidget(
        wrapWidget(
          AppButton(
            label: 'Submit',
            isLoading: true,
            onPressed: () => tapped = true,
          ),
        ),
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Submit'), findsNothing);

      await tester.tap(find.byType(AppButton));
      await tester.pump();
      expect(tapped, isFalse);
    });

    testWidgets('disables button when onPressed is null', (tester) async {
      await tester.pumpWidget(
        wrapWidget(
          const AppButton(
            label: 'Disabled',
            onPressed: null,
          ),
        ),
      );

      final filledButton =
          tester.widget<FilledButton>(find.byType(FilledButton));
      expect(filledButton.onPressed, isNull);
    });

    testWidgets('renders leading icon when provided', (tester) async {
      await tester.pumpWidget(
        wrapWidget(
          AppButton(
            label: 'Add Expense',
            icon: Icons.add,
            onPressed: () {},
          ),
        ),
      );

      expect(find.byIcon(Icons.add), findsOneWidget);
      expect(find.text('Add Expense'), findsOneWidget);
    });
  });
}

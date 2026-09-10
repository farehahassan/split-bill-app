import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:split_bill_app/app/app.dart';
import 'package:split_bill_app/app/di/injection.dart';
import 'package:split_bill_app/app/router/app_router.dart';
import 'package:split_bill_app/core/network/api_client.dart';

import '../helpers/fake_http_adapter.dart';

/// Pumps until all finite entrance animations and staggered delays finish.
Future<void> settleAnimations(WidgetTester tester) async {
  await tester.pumpAndSettle();
  await tester.pump(const Duration(seconds: 1));
  await tester.pumpAndSettle();
}

FakeResponse? Function(RequestOptions options) scriptedBackend() {
  final now = '2026-09-10T10:00:00Z';
  return (options) {
    final path = options.path;
    if (options.method == 'POST' && path == '/auth/login') {
      return FakeResponse(
        200,
        {
          'success': true,
          'data': {
            'user': {'id': 'u1', 'name': 'Ahmed Raza', 'email': 'ahmed@example.com'},
            'token': 'access-1',
            'refreshToken': 'refresh-1',
          },
        },
      );
    }
    if (options.method == 'GET' && path == '/auth/me') {
      return FakeResponse(
        200,
        {
          'success': true,
          'data': {
            'user': {'id': 'u1', 'name': 'Ahmed Raza', 'email': 'ahmed@example.com'},
          },
        },
      );
    }
    if (options.method == 'GET' && path == '/groups') {
      return FakeResponse(200, {
        'success': true,
        'data': {
          'groups': <Object?>[
            {
              'id': 'g1',
              'name': 'Trip to Naran',
              'createdById': 'u1',
              'memberCount': 3,
              'createdAt': now,
              'updatedAt': now,
            },
          ],
        },
      });
    }
    if (options.method == 'GET' && path == '/groups/g1/balances') {
      return FakeResponse(200, {
        'success': true,
        'data': {
          'balances': <Object?>[
            {'userId': 'u1', 'name': 'Ahmed Raza', 'email': 'ahmed@example.com', 'amountMinorUnits': 0},
          ],
        },
      });
    }
    if (options.method == 'GET' && path == '/groups/g1/activity') {
      return FakeResponse(200, {
        'success': true,
        'data': {'events': <Object?>[]},
        'pagination': {'page': 1, 'limit': 2, 'total': 0},
      });
    }
    return null;
  };
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
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    getIt.reset();
    final dio = Dio(BaseOptions(baseUrl: 'http://test.local'));
    dio.httpClientAdapter = FakeHttpAdapter(scriptedBackend());
    await configureDependencies(
      apiClient: ApiClient(baseUrl: 'http://test.local', dio: dio),
    );
  });

  testWidgets('splash → sign in → home dashboard', (tester) async {
    await tester.pumpWidget(SplitBillApp(router: createAppRouter()));

    // Splash with animated logo.
    expect(find.text('Hisab'), findsOneWidget);
    expect(find.text('Keep your splits clear.'), findsOneWidget);

    // Advance past the splash restore + auto-navigation.
    await tester.pump(const Duration(milliseconds: 2500));
    await settleAnimations(tester);

    // Sign-in screen.
    expect(find.text('Welcome back. Keep your splits clear.'), findsOneWidget);
    expect(find.text('Sign In'), findsOneWidget);

    await signIn(tester);

    // Home dashboard with real (scripted) data.
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
    expect(find.text('Trip to Naran'), findsOneWidget);

    // Activity tab shows group balances & settlements.
    await tester.tap(find.text('Activity'));
    await settleAnimations(tester);
    expect(find.text('Balances'), findsOneWidget);
    expect(find.text('Trip to Naran'), findsWidgets);
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
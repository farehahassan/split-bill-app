import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/constants/app_constants.dart';
import '../core/theme/app_theme.dart';
import 'router/app_router.dart';

/// Root application widget.
class SplitBillApp extends StatelessWidget {
  const SplitBillApp({super.key, this.router});

  /// Router override for tests; defaults to the shared [appRouter].
  final GoRouter? router;

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: AppConstants.appName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      routerConfig: router ?? appRouter,
      // Respect the system text scale for accessibility, capped so the
      // fixed-size showcase layout never breaks at extreme scaling.
      builder: (context, child) => MediaQuery.withClampedTextScaling(
        maxScaleFactor: 1.3,
        child: child ?? const SizedBox.shrink(),
      ),
    );
  }
}

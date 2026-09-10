import 'package:flutter/foundation.dart';

/// Environment-aware application configuration.
///
/// The base API URL is injected at build/run time with
/// `--dart-define=API_BASE_URL=...` so feature code never hardcodes a machine
/// URL. When no value is provided:
///
/// - debug/profile builds default to the local development backend;
/// - release builds throw so a build that forgot `API_BASE_URL` fails fast at
///   startup instead of silently pointing at a placeholder endpoint.
///
/// No secrets, tokens, or machine-specific values are stored here.
abstract final class AppConfig {
  static const String _providedApiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
  );

  /// Backend base URL including the `/api/v1` prefix, e.g.
  /// `http://localhost:3000/api/v1`.
  static String get apiBaseUrl {
    if (_providedApiBaseUrl.isNotEmpty) return _providedApiBaseUrl;
    if (kReleaseMode) {
      throw StateError(
        'API_BASE_URL must be provided for release builds via '
        '--dart-define=API_BASE_URL=https://...',
      );
    }
    return 'http://localhost:3000/api/v1';
  }
}
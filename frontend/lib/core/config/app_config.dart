import 'package:flutter/foundation.dart';

/// Environment-aware application configuration.
///
/// The base API URL is injected at build/run time with
/// `--dart-define=API_BASE_URL=...` so feature code never hardcodes a machine
/// URL. When no value is provided:
///
/// - debug/profile builds default to the local development backend;
/// - release builds default to a production placeholder that must be
///   overridden with the real deployed backend during release builds.
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
    if (kReleaseMode) return 'https://api.hisab.example.com/api/v1';
    return 'http://localhost:3000/api/v1';
  }
}
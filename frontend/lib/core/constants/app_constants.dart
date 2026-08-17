/// App-wide constants. Environment-specific configuration lives here so
/// feature code never hardcodes URLs or currencies.
abstract final class AppConstants {
  static const String appName = 'Hisab';

  /// Currency shown when formatting amounts.
  static const String currencyCode = 'PKR';
  static const String currencySymbol = 'PKR';

  /// Shared network timeout for the API client.
  static const Duration networkTimeout = Duration(seconds: 15);

  /// Base URL for the backend API. Override at build/run time with
  /// `--dart-define=API_BASE_URL=https://...`. The app is currently a UI
  /// showcase backed by mock data; wire the ApiClient up when a backend
  /// exists.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://api.example.com/v1',
  );
}

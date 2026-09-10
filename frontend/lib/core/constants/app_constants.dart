/// App-wide constants. Environment-specific configuration lives in
/// `core/config/app_config.dart`; feature code never hardcodes URLs.
abstract final class AppConstants {
  static const String appName = 'Hisab';

  /// Currency shown when formatting amounts.
  static const String currencyCode = 'PKR';
  static const String currencySymbol = 'PKR';

  /// Shared network timeout for the API client.
  static const Duration networkTimeout = Duration(seconds: 15);
}

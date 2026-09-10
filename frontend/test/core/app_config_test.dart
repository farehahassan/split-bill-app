import 'package:flutter_test/flutter_test.dart';
import 'package:split_bill_app/core/config/app_config.dart';

void main() {
  test('defaults to the local backend base URL in debug builds', () {
    // const String.fromEnvironment resolves to the compile-time value; without
    // a --dart-define the fallback (kReleaseMode false in tests) is localhost.
    const provided = String.fromEnvironment('API_BASE_URL');
    if (provided.isEmpty) {
      expect(AppConfig.apiBaseUrl, 'http://localhost:3000/api/v1');
    } else {
      expect(AppConfig.apiBaseUrl, provided);
    }
  });
}
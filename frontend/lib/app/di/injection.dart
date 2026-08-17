import 'package:get_it/get_it.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/constants/app_constants.dart';
import '../../core/network/api_client.dart';
import '../../core/storage/local_storage.dart';

/// Global service locator. The dependency graph is built once in
/// [configureDependencies]. The current UI is a mock-data showcase, so only
/// shared infrastructure is registered — feature repositories/data sources
/// will be wired here again when a backend is added.
final GetIt getIt = GetIt.instance;

/// Composition root: registers shared app dependencies once at startup
/// (and in widget tests) before building the widget tree.
Future<void> configureDependencies() async {
  if (getIt.isRegistered<LocalStorage>()) return;

  final prefs = await SharedPreferences.getInstance();
  getIt.registerLazySingleton<LocalStorage>(() => LocalStorage(prefs));

  // Shared HTTP client, ready for future API-backed data sources.
  getIt.registerLazySingleton<ApiClient>(
    () => ApiClient(baseUrl: AppConstants.apiBaseUrl),
  );
}

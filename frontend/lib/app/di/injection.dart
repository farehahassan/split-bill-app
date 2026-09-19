import 'package:get_it/get_it.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/config/app_config.dart';
import '../../core/network/api_client.dart';
import '../../core/network/auth_token_store.dart';
import '../../core/storage/local_storage.dart';
import '../../core/storage/secure_storage.dart';
import '../../features/activity/data/datasources/activity_remote_data_source.dart';
import '../../features/activity/data/repositories/activity_repository.dart';
import '../../features/auth/data/datasources/auth_remote_data_source.dart';
import '../../features/auth/data/repositories/auth_repository.dart';
import '../../features/auth/logic/auth_controller.dart';
import '../../features/expenses/data/datasources/expenses_remote_data_source.dart';
import '../../features/expenses/data/repositories/expenses_repository.dart';
import '../../features/groups/data/datasources/groups_remote_data_source.dart';
import '../../features/groups/data/repositories/groups_repository.dart';
import '../../features/settlements/data/datasources/settlements_remote_data_source.dart';
import '../../features/settlements/data/repositories/settlements_repository.dart';

/// Global service locator. The dependency graph is built once in
/// [configureDependencies].
final GetIt getIt = GetIt.instance;

/// Whether [T] has already been registered in the service locator.
bool isRegistered<T extends Object>() => getIt.isRegistered<T>();

/// Composition root: registers shared app dependencies once at startup
/// (and in widget tests) before building the widget tree.
///
/// [apiClient] is injectable so tests can substitute a client with a fake
/// HTTP adapter without touching production wiring. [secureStorage] is
/// injectable so widget tests can avoid the native keychain plugin.
Future<void> configureDependencies({ApiClient? apiClient, SecureStorage? secureStorage}) async {
  if (getIt.isRegistered<LocalStorage>()) return;

  final prefs = await SharedPreferences.getInstance();
  final localStorage = LocalStorage(prefs);
  getIt.registerLazySingleton<LocalStorage>(() => localStorage);

  final tokenStore = AuthTokenStore(secureStorage ?? FlutterSecureStorageImpl());
  getIt.registerLazySingleton<AuthTokenStore>(() => tokenStore);

  getIt.registerLazySingleton<ApiClient>(
    () =>
        apiClient ??
        ApiClient(
          baseUrl: AppConfig.apiBaseUrl,
          tokenStore: tokenStore,
          refreshSession: () => getIt<AuthController>().refreshSession(),
          onSessionExpired: () => getIt<AuthController>().forceSessionExpired(),
        ),
  );

  getIt.registerLazySingleton<AuthRemoteDataSource>(
    () => AuthRemoteDataSource(getIt<ApiClient>()),
  );
  getIt.registerLazySingleton<AuthRepository>(
    () => AuthRepository(getIt<AuthRemoteDataSource>(), tokenStore),
  );
  getIt.registerLazySingleton<AuthController>(
    () => AuthController(getIt<AuthRepository>()),
  );

  getIt.registerLazySingleton<GroupsRemoteDataSource>(
    () => GroupsRemoteDataSource(getIt<ApiClient>()),
  );
  getIt.registerLazySingleton<GroupsRepository>(
    () => GroupsRepositoryImpl(getIt<GroupsRemoteDataSource>()),
  );

  getIt.registerLazySingleton<ExpensesRemoteDataSource>(
    () => ExpensesRemoteDataSource(getIt<ApiClient>()),
  );
  getIt.registerLazySingleton<ExpensesRepository>(
    () => ExpensesRepositoryImpl(getIt<ExpensesRemoteDataSource>()),
  );

  getIt.registerLazySingleton<SettlementsRemoteDataSource>(
    () => SettlementsRemoteDataSource(getIt<ApiClient>()),
  );
  getIt.registerLazySingleton<SettlementsRepository>(
    () => SettlementsRepositoryImpl(getIt<SettlementsRemoteDataSource>()),
  );

  getIt.registerLazySingleton<ActivityRemoteDataSource>(
    () => ActivityRemoteDataSource(getIt<ApiClient>()),
  );
  getIt.registerLazySingleton<ActivityRepository>(
    () => ActivityRepositoryImpl(getIt<ActivityRemoteDataSource>()),
  );
}
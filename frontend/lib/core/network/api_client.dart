import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import 'api_exception_mapper.dart';
import 'auth_token_store.dart';

/// Endpoints that exchange credentials directly; they never need a stored
/// access token, and a 401 from them means "bad credentials" (login/refresh),
/// which must not be mistaken for an expired session.
const Set<String> _unauthenticatedAuthPaths = {
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
};

/// Single shared HTTP client for the whole app.
///
/// Owns the base URL, timeouts, common headers, bearer-token attachment and
/// response normalization. On an expired access token it performs ONE safe
/// refresh + retry for read-only (GET) requests. Mutations are NEVER
/// auto-retried — including financial ones — so an unclear network outcome can
/// never create a duplicate expense or settlement.
///
/// When a session cannot be refreshed, [onSessionExpired] is invoked so the
/// UI can clear state and send the user to sign-in.
class ApiClient {
  ApiClient({
    required String baseUrl,
    AuthTokenStore? tokenStore,
    Future<bool> Function()? refreshSession,
    VoidCallback? onSessionExpired,
    Dio? dio,
  }) : _tokenStore = tokenStore,
       _refreshSession = refreshSession,
       _onSessionExpired = onSessionExpired {
    _dio = dio ??
        Dio(
          BaseOptions(
            baseUrl: baseUrl,
            connectTimeout: networkTimeout,
            receiveTimeout: networkTimeout,
            sendTimeout: networkTimeout,
            headers: const {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
          ),
        );
    _dio.interceptors.add(_authInterceptor);
  }

  static const Duration networkTimeout = Duration(seconds: 15);

  /// Marker used to prevent infinite refresh/retry loops.
  static const String _authRetriedMarker = '_auth_retried';

  final AuthTokenStore? _tokenStore;
  final Future<bool> Function()? _refreshSession;
  final VoidCallback? _onSessionExpired;

  late final Dio _dio;
  Future<bool>? _refreshInFlight;

  /// Underlying Dio instance (exposed for tests / advanced use).
  Dio get dio => _dio;

  late final InterceptorsWrapper _authInterceptor = InterceptorsWrapper(
    onRequest: _onRequest,
    onError: _onError,
  );

  Future<dynamic> get(String path, {Map<String, dynamic>? queryParameters}) =>
      _execute(() => _dio.get<dynamic>(path, queryParameters: queryParameters));

  Future<dynamic> post(String path, {Object? data, Map<String, dynamic>? headers}) =>
      _execute(() => _dio.post<dynamic>(path, data: data, options: Options(headers: headers)));

  Future<dynamic> put(String path, {Object? data}) =>
      _execute(() => _dio.put<dynamic>(path, data: data));

  Future<dynamic> delete(String path, {Object? data}) =>
      _execute(() => _dio.delete<dynamic>(path, data: data));

  /// Executes [request], normalizing 204/empty bodies to `null`. Errored and
  /// already-refreshed requests flow through the interceptor chain first.
  Future<dynamic> _execute(Future<Response<dynamic>> Function() request) async {
    try {
      final response = await request();
      if (response.statusCode == 204 || response.data == null) return null;
      return response.data;
    } catch (error, stackTrace) {
      throw mapApiException(error, stackTrace);
    }
  }

  void _onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await _tokenStore?.readAccessToken();
    if (token != null && token.isNotEmpty && !_unauthenticatedAuthPaths.contains(options.path)) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  Future<void> _onError(DioException error, ErrorInterceptorHandler handler) async {
    final options = error.requestOptions;
    final status = error.response?.statusCode;

    if (status != 401) {
      handler.next(error);
      return;
    }

    // A 401 from an auth endpoint itself means invalid credentials, not an
    // expired session — pass it through untouched.
    if (_unauthenticatedAuthPaths.contains(options.path)) {
      handler.next(error);
      return;
    }

    // Read-only requests may be refreshed and retried exactly once.
    final isSafeRequest = options.method == 'GET' || options.method == 'HEAD';
    final alreadyRetried = options.extra[_authRetriedMarker] == true;

    if (isSafeRequest && !alreadyRetried) {
      final refreshed = await _tryRefreshOnce();
      if (refreshed) {
        final retryOptions = options.copyWith();
        retryOptions.extra[_authRetriedMarker] = true;
        try {
          final response = await _dio.fetch<dynamic>(retryOptions);
          handler.resolve(response);
          return;
        } catch (retryError) {
          handler.next(retryError as DioException? ?? error);
          return;
        }
      }
      await _expireSession();
      handler.next(error);
      return;
    }

    // A second 401 (even after a successful refresh) means the session is
    // unrecoverable. Mutations are never auto-retried, but an authentically
    // invalid access token still invalidates the stored session.
    if (isSafeRequest || options.extra[_authRetriedMarker] == true) {
      await _expireSession();
    }
    handler.next(error);
  }

  /// Attempts to refresh the access token. Concurrent callers share one
  /// in-flight refresh so 401 storms on parallel GETs never rotate twice.
  Future<bool> _tryRefreshOnce() {
    final refresh = _refreshSession;
    if (refresh == null) return Future.value(false);
    final inFlight = _refreshInFlight;
    if (inFlight != null) return inFlight;
    final future = refresh();
    _refreshInFlight = future;
    return future.whenComplete(() => _refreshInFlight = null);
  }

  Future<void> _expireSession() async {
    await _tokenStore?.clear();
    _onSessionExpired?.call();
  }
}
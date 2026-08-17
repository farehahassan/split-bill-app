import 'package:dio/dio.dart';

import '../constants/app_constants.dart';
import 'api_exception_mapper.dart';

/// Single shared HTTP client for the whole app.
///
/// Owns the base URL, timeouts, common headers, auth token attachment and
/// response normalization. Feature data sources use this client instead of
/// instantiating their own HTTP client (playbook section 10).
class ApiClient {
  ApiClient({required String baseUrl, String? Function()? tokenProvider}) {
    _dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: AppConstants.networkTimeout,
        receiveTimeout: AppConstants.networkTimeout,
        sendTimeout: AppConstants.networkTimeout,
        headers: const {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final token = tokenProvider?.call();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
      ),
    );
  }

  late final Dio _dio;

  Future<dynamic> get(String path, {Map<String, dynamic>? queryParameters}) =>
      _execute(() => _dio.get<dynamic>(path, queryParameters: queryParameters));

  Future<dynamic> post(String path, {Object? data}) =>
      _execute(() => _dio.post<dynamic>(path, data: data));

  Future<dynamic> put(String path, {Object? data}) =>
      _execute(() => _dio.put<dynamic>(path, data: data));

  Future<dynamic> delete(String path, {Object? data}) =>
      _execute(() => _dio.delete<dynamic>(path, data: data));

  Future<dynamic> _execute(Future<Response<dynamic>> Function() request) async {
    try {
      final response = await request();
      // 204 No Content and empty bodies are normalized to null.
      if (response.statusCode == 204 || response.data == null) return null;
      return response.data;
    } catch (error, stackTrace) {
      throw mapApiException(error, stackTrace);
    }
  }
}

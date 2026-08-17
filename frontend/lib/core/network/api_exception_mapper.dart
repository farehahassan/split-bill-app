import 'package:dio/dio.dart';

import '../errors/app_failure.dart';

/// Maps low-level network/HTTP exceptions to application-level [AppFailure]s.
///
/// See the "API Error Handling" section of the playbook:
/// 200/201/204 -> success, 400 -> bad request, 401 -> unauthenticated,
/// 403 -> forbidden, 404 -> not found, 409 -> conflict, 422 -> validation,
/// 429 -> rate limited, 500+ -> server failure.
AppFailure mapApiException(Object error, [StackTrace? stackTrace]) {
  if (error is AppFailure) return error;

  if (error is DioException) {
    final statusCode = error.response?.statusCode;
    if (statusCode != null) {
      return switch (statusCode) {
        400 => ValidationFailure(
          _messageFrom(error, 'The request was invalid.'),
        ),
        401 => const UnauthorizedFailure(),
        403 => const UnauthorizedFailure(),
        404 => const NotFoundFailure(),
        409 => ValidationFailure(
          _messageFrom(error, 'This conflicts with existing data.'),
        ),
        422 => ValidationFailure(
          _messageFrom(error, 'Please check the information you entered.'),
        ),
        429 => const ServerFailure(
          'Too many requests. Please try again later.',
        ),
        _ when statusCode >= 500 => ServerFailure(
          _messageFrom(
            error,
            'Something went wrong on our side. Please try again later.',
          ),
        ),
        _ => ServerFailure(
          _messageFrom(error, 'Something went wrong. Please try again.'),
        ),
      };
    }

    return switch (error.type) {
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.receiveTimeout => const NetworkFailure(
        'The request timed out. Please try again.',
      ),
      DioExceptionType.connectionError ||
      DioExceptionType.unknown => const NetworkFailure(),
      _ => const NetworkFailure(),
    };
  }

  return const UnknownFailure();
}

/// Uses the server-provided `message` only when it is a clean string;
/// otherwise falls back to a safe default so raw internals never leak.
String _messageFrom(DioException error, String fallback) {
  final data = error.response?.data;
  if (data is Map && data['message'] is String) {
    return data['message'] as String;
  }
  return fallback;
}

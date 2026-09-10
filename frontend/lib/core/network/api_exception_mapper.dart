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
        400 || 409 || 422 => _validationFrom(error),
        401 => const UnauthorizedFailure(),
        403 => const UnauthorizedFailure(),
        404 => const NotFoundFailure(),
        429 => const ServerFailure(
          'Too many requests. Please try again later.',
        ),
        503 => ServiceUnavailableFailure(_messageFrom(error)),
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

/// Returns a user-safe, non-technical message for [error] regardless of type.
///
/// Guards against leaking internal details (e.g. raw exception/dio internals)
/// to the UI; always yields a human-readable sentence.
String appErrorMessage(Object error) {
  if (error is AppFailure) return error.message;
  if (error is DioException) return mapApiException(error).message;
  return 'Something went wrong. Please try again.';
}

/// Builds a [ValidationFailure] that keeps the backend's structured field
/// errors alongside a safe summary message.
AppFailure _validationFrom(DioException error) {
  final data = error.response?.data;
  final List<ApiFieldError> fieldErrors = [];
  if (data is Map && data['errors'] is List) {
    for (final entry in data['errors'] as List) {
      if (entry is Map) {
        final field = entry['field'];
        final message = entry['message'];
        if (field is String && message is String) {
          fieldErrors.add(ApiFieldError(field: field, message: message));
        }
      }
    }
  }
  return FieldValidationFailure(_messageFrom(error), fieldErrors);
}

/// Uses the server-provided `message` only when it is a clean string;
/// otherwise falls back to a safe default so raw internals never leak.
String _messageFrom(DioException error, [String fallback = 'Please check the information you entered.']) {
  final data = error.response?.data;
  if (data is Map && data['message'] is String) {
    return data['message'] as String;
  }
  return fallback;
}
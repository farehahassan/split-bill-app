import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:split_bill_app/core/errors/app_failure.dart';
import 'package:split_bill_app/core/network/api_exception_mapper.dart';

void main() {
  DioException exception(
    DioExceptionType type, {
    int? statusCode,
    Object? data,
  }) {
    return DioException(
      requestOptions: RequestOptions(path: '/test'),
      type: type,
      response: statusCode == null
          ? null
          : Response<dynamic>(
              requestOptions: RequestOptions(path: '/test'),
              statusCode: statusCode,
              data: data,
            ),
    );
  }

  test('401 maps to UnauthorizedFailure', () {
    final failure = mapApiException(
      exception(DioExceptionType.badResponse, statusCode: 401),
    );
    expect(failure, isA<UnauthorizedFailure>());
  });

  test('422 maps to ValidationFailure using the server message', () {
    final failure = mapApiException(
      exception(
        DioExceptionType.badResponse,
        statusCode: 422,
        data: {'message': 'Title is required'},
      ),
    );
    expect(failure, isA<ValidationFailure>());
    expect(failure.message, 'Title is required');
  });

  test('500 maps to ServerFailure', () {
    final failure = mapApiException(
      exception(DioExceptionType.badResponse, statusCode: 500),
    );
    expect(failure, isA<ServerFailure>());
  });

  test('timeouts map to NetworkFailure', () {
    final failure = mapApiException(
      exception(DioExceptionType.connectionTimeout),
    );
    expect(failure, isA<NetworkFailure>());
    final send = mapApiException(exception(DioExceptionType.sendTimeout));
    expect(send, isA<NetworkFailure>());
  });

  test('connection errors map to NetworkFailure', () {
    final failure = mapApiException(
      exception(DioExceptionType.connectionError),
    );
    expect(failure, isA<NetworkFailure>());
  });

  test('non-Dio errors map to UnknownFailure', () {
    expect(mapApiException(StateError('boom')), isA<UnknownFailure>());
  });

  test('already-normalized AppFailures pass through unchanged', () {
    const original = UnauthorizedFailure();
    expect(mapApiException(original), same(original));
  });
}

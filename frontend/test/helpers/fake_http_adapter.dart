import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

/// A canned HTTP response produced by the fake adapter.
class FakeResponse {
  const FakeResponse(this.statusCode, this.data);

  final int statusCode;
  final Map<String, Object?> data;

  Map<String, Object?> get envelopeSuccess => {
    'success': true,
    'data': data,
  };
}

/// Synchronous, in-memory HTTP backend that scripted widget/unit tests can
/// point a [Dio] at in place of the real network.
///
/// Records every request so tests can assert on paths, payloads and headers.
class FakeHttpAdapter implements HttpClientAdapter {
  FakeHttpAdapter(this.handle);

  /// Returns the canned response for [options], or `null` to emit a 404.
  FakeResponse? Function(RequestOptions options) handle;

  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final match = handle(options);
    if (match == null) {
      throw DioException.badResponse(
        statusCode: 404,
        requestOptions: options,
        response: Response<dynamic>(
          requestOptions: options,
          statusCode: 404,
          data: {'success': false, 'message': 'Not found'},
        ),
      );
    }
    final body = utf8.encode(jsonEncode(match.data));
    return ResponseBody.fromBytes(
      body,
      match.statusCode,
      headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
    );
  }

  @override
  void close({bool force = false}) {}
}
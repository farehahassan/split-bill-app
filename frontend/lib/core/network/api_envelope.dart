/// Helpers for parsing the backend's response envelope.
///
/// Successful responses follow `{ "success": true, "data": ... }`. Some
/// endpoints (activity feed) additionally return a top-level `pagination`
/// object alongside `success` and `data`.
library;

/// Thrown when a response is not in the expected envelope shape.
class ApiEnvelopeException implements Exception {
  ApiEnvelopeException(this.message);

  final String message;

  @override
  String toString() => 'ApiEnvelopeException: $message';
}

/// Extracts the `data` payload from a decoded JSON response envelope.
Object? unwrapApiData(Object? decoded) {
  if (decoded is! Map) {
    throw ApiEnvelopeException('Expected a JSON object response.');
  }
  if (decoded['success'] != true) {
    throw ApiEnvelopeException('Response marked as unsuccessful.');
  }
  if (!decoded.containsKey('data')) {
    throw ApiEnvelopeException('Response is missing the data payload.');
  }
  return decoded['data'];
}

/// Extracts a `pagination` object from a decoded envelope, when present.
Map<String, dynamic>? unwrapPagination(Object? decoded) {
  if (decoded is! Map || decoded['pagination'] is! Map) return null;
  return (decoded['pagination'] as Map).cast<String, dynamic>();
}
import 'package:flutter_test/flutter_test.dart';
import 'package:split_bill_app/core/network/api_envelope.dart';

void main() {
  test('unwrapApiData extracts the data payload', () {
    final decoded = unwrapApiData({'success': true, 'data': {'groups': <Object?>[]}});
    expect(decoded, {'groups': <Object?>[]});
  });

  test('unwrapApiData accepts a top-level list payload', () {
    final decoded = unwrapApiData({'success': true, 'data': <Object?>[1, 2, 3]});
    expect(decoded, <Object?>[1, 2, 3]);
  });

  test('unwrapApiData rejects non-object responses', () {
    expect(() => unwrapApiData('nope'), throwsA(isA<ApiEnvelopeException>()));
    expect(() => unwrapApiData(null), throwsA(isA<ApiEnvelopeException>()));
  });

  test('unwrapApiData rejects unsuccessful responses', () {
    expect(
      () => unwrapApiData({'success': false, 'message': 'nope'}),
      throwsA(isA<ApiEnvelopeException>()),
    );
  });

  test('unwrapApiData rejects responses missing data', () {
    expect(
      () => unwrapApiData({'success': true}),
      throwsA(isA<ApiEnvelopeException>()),
    );
  });

  test('unwrapPagination returns the pagination object or null', () {
    expect(
      unwrapPagination({
        'success': true,
        'data': {'events': <Object?>[]},
        'pagination': {'page': 1, 'limit': 20, 'total': 5},
      }),
      {'page': 1, 'limit': 20, 'total': 5},
    );
    expect(unwrapPagination({'success': true, 'data': <Object?>[]}), isNull);
  });
}
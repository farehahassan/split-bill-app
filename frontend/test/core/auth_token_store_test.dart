import 'package:flutter_test/flutter_test.dart';
import 'package:split_bill_app/core/network/auth_token_store.dart';
import 'package:split_bill_app/core/storage/secure_storage.dart';

void main() {
  late AuthTokenStore store;

  setUp(() {
    store = AuthTokenStore(InMemorySecureStorage());
  });

  test('starts without a session', () async {
    expect(await store.hasStoredSession(), isFalse);
    expect(await store.readAccessToken(), isNull);
  });

  test('stores and reads a session', () async {
    await store.saveSession(accessToken: 'a1', refreshToken: 'r1');
    expect(await store.readAccessToken(), 'a1');
    expect(await store.readRefreshToken(), 'r1');
    expect(await store.hasSession(), isTrue);
  });

  test('clears the session', () async {
    await store.saveSession(accessToken: 'a1', refreshToken: 'r1');
    await store.clear();
    expect(await store.readAccessToken(), isNull);
    expect(await store.readRefreshToken(), isNull);
    expect(await store.hasStoredSession(), isFalse);
  });
}
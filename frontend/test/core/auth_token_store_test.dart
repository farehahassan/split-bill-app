import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:split_bill_app/core/network/auth_token_store.dart';
import 'package:split_bill_app/core/storage/local_storage.dart';

void main() {
  late AuthTokenStore store;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    store = AuthTokenStore(LocalStorage(await SharedPreferences.getInstance()));
  });

  test('starts without a session', () {
    expect(store.hasStoredSession, isFalse);
    expect(store.accessToken, isNull);
  });

  test('stores and reads a session', () async {
    await store.saveSession(accessToken: 'a1', refreshToken: 'r1');
    expect(store.accessToken, 'a1');
    expect(store.refreshToken, 'r1');
    expect(store.hasSession, isTrue);
  });

  test('clears the session', () async {
    await store.saveSession(accessToken: 'a1', refreshToken: 'r1');
    await store.clear();
    expect(store.accessToken, isNull);
    expect(store.refreshToken, isNull);
    expect(store.hasStoredSession, isFalse);
  });
}
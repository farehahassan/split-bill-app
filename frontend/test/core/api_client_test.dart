import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:split_bill_app/core/errors/app_failure.dart';
import 'package:split_bill_app/core/network/api_client.dart';
import 'package:split_bill_app/core/network/auth_token_store.dart';
import 'package:split_bill_app/core/storage/secure_storage.dart';

import '../helpers/fake_http_adapter.dart';

void main() {
  late ApiClient client;
  late FakeHttpAdapter adapter;
  late AuthTokenStore tokenStore;
  var refreshCount = 0;
  var expiredCount = 0;

  setUp(() {
    tokenStore = AuthTokenStore(InMemorySecureStorage());
    refreshCount = 0;
    expiredCount = 0;

    adapter = FakeHttpAdapter((options) => null);
    final dio = Dio(BaseOptions(baseUrl: 'http://test.local'));
    dio.httpClientAdapter = adapter;
    client = ApiClient(
      baseUrl: 'http://test.local',
      tokenStore: tokenStore,
      refreshSession: () async {
        refreshCount++;
        return true;
      },
      onSessionExpired: () => expiredCount++,
      dio: dio,
    );
  });

  FakeResponse jsonResponse(int status, [Map<String, Object?> data = const {}]) {
    return FakeResponse(status, data);
  }

  test('attaches the bearer token to authenticated requests', () async {
    await tokenStore.saveSession(accessToken: 'access-1', refreshToken: 'refresh-1');
    adapter.handle = (o) => jsonResponse(200, {'ok': true});

    await client.get('/groups');

    expect(adapter.requests, hasLength(1));
    expect(adapter.requests.single.headers['Authorization'], 'Bearer access-1');
  });

  test('does not attach the token to login/register endpoints', () async {
    await tokenStore.saveSession(accessToken: 'access-1', refreshToken: 'refresh-1');
    adapter.handle = (o) =>
        o.path == '/auth/login' ? jsonResponse(200, {'ok': true}) : null;

    await client.post('/auth/login', data: {'email': 'a@b.c'});

    expect(adapter.requests.single.headers.containsKey('Authorization'), isFalse);
  });

  test('GET 401 refreshes once then retries successfully', () async {
    await tokenStore.saveSession(accessToken: 'stale', refreshToken: 'refresh-1');
    var calls = 0;
    adapter.handle = (o) {
      calls++;
      if (calls == 1) {
        return jsonResponse(401, {'success': false, 'message': 'expired'});
      }
      return jsonResponse(200, {'groups': <Object?>[]});
    };

    final data = await client.get('/groups');

    expect(data, {'groups': <Object?>[]});
    expect(calls, 2);
    expect(refreshCount, 1);
    expect(expiredCount, 0);
  });

  test('GET 401 with a failed refresh expires the session and does not retry', () async {
    final failingStore = AuthTokenStore(InMemorySecureStorage());
    await failingStore.saveSession(accessToken: 'stale', refreshToken: 'refresh-1');

    final failingDio = Dio(BaseOptions(baseUrl: 'http://test.local'));
    failingDio.httpClientAdapter = FakeHttpAdapter((o) => jsonResponse(401, {}));
    final failingClient = ApiClient(
      baseUrl: 'http://test.local',
      tokenStore: failingStore,
      refreshSession: () async {
        refreshCount++;
        return false;
      },
      onSessionExpired: () => expiredCount++,
      dio: failingDio,
    );

    await expectLater(
      failingClient.get('/groups'),
      throwsA(isA<UnauthorizedFailure>()),
    );
    expect(refreshCount, 1);
    expect(expiredCount, 1);
    expect(await failingStore.hasStoredSession(), isFalse);
  });

  test('mutations (POST) are never auto-retried on 401', () async {
    await tokenStore.saveSession(accessToken: 'stale', refreshToken: 'refresh-1');
    var calls = 0;
    adapter.handle = (o) {
      calls++;
      return jsonResponse(401, {'message': 'expired'});
    };

    await expectLater(
      client.post('/groups', data: {'name': 'Trip'}),
      throwsA(isA<UnauthorizedFailure>()),
    );
    expect(calls, 1);
    expect(refreshCount, 0);
    expect(expiredCount, 0);
  });

  test('a second GET 401 after refresh also expires the session', () async {
    await tokenStore.saveSession(accessToken: 'stale', refreshToken: 'refresh-1');
    adapter.handle = (o) => jsonResponse(401, {'message': 'expired'});

    await expectLater(
      client.get('/groups'),
      throwsA(isA<UnauthorizedFailure>()),
    );
    expect(refreshCount, 1);
    expect(expiredCount, 1);
  });

  test('parallel 401 GETs share a single refresh', () async {
    await tokenStore.saveSession(accessToken: 'stale', refreshToken: 'refresh-1');
    var calls = 0;
    adapter.handle = (o) {
      calls++;
      return calls <= 1 ? jsonResponse(401, {}) : jsonResponse(200, {'ok': true});
    };

    await Future.wait([client.get('/a'), client.get('/b')]);

    // One refresh attempt shared by both requests (each retried once).
    expect(refreshCount, 1);
  });

  test('204 responses normalize to null', () async {
    adapter.handle = (o) => FakeResponse(204, {});
    final result = await client.delete('/groups/g1');
    expect(result, isNull);
  });
}
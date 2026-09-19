import '../storage/secure_storage.dart';

/// Persisted authentication tokens stored behind the platform keychain
/// via [SecureStorage]. All reads are asynchronous because the underlying
/// keychain access may require OS interaction on first read.
class AuthTokenStore {
  AuthTokenStore(this._storage);

  static const String accessTokenKey = 'auth_access_token';
  static const String refreshTokenKey = 'auth_refresh_token';

  final SecureStorage _storage;

  Future<String?> readAccessToken() => _storage.getString(accessTokenKey);

  Future<String?> readRefreshToken() => _storage.getString(refreshTokenKey);

  Future<bool> hasSession() async {
    final access = await readAccessToken();
    final refresh = await readRefreshToken();
    return access != null &&
        access.isNotEmpty &&
        refresh != null &&
        refresh.isNotEmpty;
  }

  Future<bool> hasStoredSession() async {
    final access = await readAccessToken();
    final refresh = await readRefreshToken();
    return access != null || refresh != null;
  }

  Future<void> saveSession({
    required String accessToken,
    required String refreshToken,
  }) async {
    await _storage.setString(accessTokenKey, accessToken);
    await _storage.setString(refreshTokenKey, refreshToken);
  }

  Future<void> clear() async {
    await _storage.remove(accessTokenKey);
    await _storage.remove(refreshTokenKey);
  }
}
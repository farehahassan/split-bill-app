import '../storage/local_storage.dart';

/// Persisted authentication tokens.
///
/// Access and refresh tokens are opaque credentials and are stored behind the
/// [LocalStorage] abstraction so the plugin can later be swapped for a secure
/// enclosure (e.g. flutter_secure_storage) with no call-site changes. Tokens
/// are never logged.
class AuthTokenStore {
  AuthTokenStore(this._storage);

  static const String accessTokenKey = 'auth_access_token';
  static const String refreshTokenKey = 'auth_refresh_token';

  final LocalStorage _storage;

  String? get accessToken => _storage.getString(accessTokenKey);

  String? get refreshToken => _storage.getString(refreshTokenKey);

  bool get hasSession =>
      accessToken != null && accessToken!.isNotEmpty &&
      refreshToken != null &&
      refreshToken!.isNotEmpty;

  /// Whether a previously stored session exists (used for app-launch restore
  /// before deciding where to send the user).
  bool get hasStoredSession =>
      accessToken != null || refreshToken != null;

  Future<void> saveSession({required String accessToken, required String refreshToken}) async {
    await _storage.setString(accessTokenKey, accessToken);
    await _storage.setString(refreshTokenKey, refreshToken);
  }

  Future<void> clear() async {
    await _storage.remove(accessTokenKey);
    await _storage.remove(refreshTokenKey);
  }
}
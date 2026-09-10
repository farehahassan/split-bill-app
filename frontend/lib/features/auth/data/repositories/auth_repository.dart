import '../../../../core/network/auth_token_store.dart';
import '../datasources/auth_remote_data_source.dart';
import '../models/auth_session.dart';
import '../models/user_profile.dart';

/// Application-facing boundary for authentication and session management.
///
/// Owns token persistence (via [AuthTokenStore]) and exposes the refresh
/// primitive used by the shared [ApiClient] when a read-only request hits a
/// 401.
class AuthRepository {
  AuthRepository(this._remote, this._tokenStore);

  final AuthRemoteDataSource _remote;
  final AuthTokenStore _tokenStore;

  AuthTokenStore get tokenStore => _tokenStore;

  Future<AuthSession> register({
    required String name,
    required String email,
    required String password,
  }) async {
    final session = await _remote.register(name: name, email: email, password: password);
    await _tokenStore.saveSession(
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    );
    return session;
  }

  Future<AuthSession> login({required String email, required String password}) async {
    final session = await _remote.login(email: email, password: password);
    await _tokenStore.saveSession(
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    );
    return session;
  }

  /// Attempts to rotate the stored refresh token into a fresh session pair.
  /// Returns the new session when one is now persisted, or `null` on failure.
  Future<AuthSession?> refreshSession() async {
    final refreshToken = _tokenStore.refreshToken;
    if (refreshToken == null || refreshToken.isEmpty) return null;
    try {
      final session = await _remote.refresh(refreshToken: refreshToken);
      await _tokenStore.saveSession(
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      );
      return session;
    } catch (_) {
      return null;
    }
  }

  Future<UserProfile> getMe() => _remote.getMe();

  Future<void> logout() async {
    final refreshToken = _tokenStore.refreshToken;
    try {
      if (refreshToken != null && refreshToken.isNotEmpty) {
        await _remote.logout(refreshToken: refreshToken);
      }
    } finally {
      await _tokenStore.clear();
    }
  }
}
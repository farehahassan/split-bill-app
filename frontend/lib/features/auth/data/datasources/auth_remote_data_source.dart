import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_envelope.dart';
import '../models/auth_session.dart';
import '../models/user_profile.dart';

/// Data source for the auth API.
///
/// Contract (from the backend routes):
///   POST /auth/register  -> 201 { user, token, refreshToken }
///   POST /auth/login     -> 200 { user, token, refreshToken }
///   POST /auth/refresh   -> 200 { user, token, refreshToken }  (rotates)
///   POST /auth/logout    -> 200 { message }
///   GET  /auth/me        -> 200 { user }
class AuthRemoteDataSource {
  AuthRemoteDataSource(this._client);

  final ApiClient _client;

  Future<AuthSession> register({
    required String name,
    required String email,
    required String password,
  }) async {
    final decoded = await _client.post(
      '/auth/register',
      data: {'name': name, 'email': email, 'password': password},
    );
    return AuthSession.fromJson(unwrapApiData(decoded) as Map<String, dynamic>);
  }

  Future<AuthSession> login({
    required String email,
    required String password,
  }) async {
    final decoded = await _client.post(
      '/auth/login',
      data: {'email': email, 'password': password},
    );
    return AuthSession.fromJson(unwrapApiData(decoded) as Map<String, dynamic>);
  }

  Future<AuthSession> refresh({required String refreshToken}) async {
    final decoded = await _client.post(
      '/auth/refresh',
      data: {'refreshToken': refreshToken},
    );
    return AuthSession.fromJson(unwrapApiData(decoded) as Map<String, dynamic>);
  }

  Future<void> logout({required String refreshToken}) async {
    await _client.post('/auth/logout', data: {'refreshToken': refreshToken});
  }

  Future<UserProfile> getMe() async {
    final decoded = await _client.get('/auth/me');
    final data = unwrapApiData(decoded) as Map<String, dynamic>;
    return UserProfile.fromJson(data['user'] as Map<String, dynamic>);
  }
}
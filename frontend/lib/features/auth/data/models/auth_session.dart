import 'user_profile.dart';

/// Result of a successful register / login / refresh request.
///
/// Holds the opaque JWT access token, the opaque refresh token (both persisted
/// via [AuthTokenStore]) and the authenticated user. Nothing sensitive is ever
/// logged.
class AuthSession {
  const AuthSession({
    required this.user,
    required this.accessToken,
    required this.refreshToken,
  });

  final UserProfile user;
  final String accessToken;
  final String refreshToken;

  static AuthSession fromJson(Map<String, dynamic> json) {
    final userJson = json['user'] as Map<String, dynamic>;
    return AuthSession(
      user: UserProfile.fromJson(userJson),
      accessToken: json['token'] as String,
      refreshToken: json['refreshToken'] as String,
    );
  }
}
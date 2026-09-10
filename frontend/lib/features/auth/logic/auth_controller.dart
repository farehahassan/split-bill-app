import 'package:flutter/foundation.dart';

import '../../../core/network/api_exception_mapper.dart';
import '../data/models/auth_session.dart';
import '../data/models/user_profile.dart';
import '../data/repositories/auth_repository.dart';

/// Enum describing the lifecycle of an [AuthController].
enum AuthStatus {
  /// Checking for a restored session at app launch.
  initializing,

  /// Authenticated with a live user.
  authenticated,

  /// Not authenticated (fresh launch or signed out).
  unauthenticated,
}

/// App-wide authentication state owner.
///
/// Owns the current session, drives login/register/logout, restores a
/// persisted session at launch and exposes the refresh primitive consumed by
/// the shared [ApiClient]. UI observes it via `ListenableBuilder`; no Cubit
/// package is required — the app's existing architecture is
/// `StatefulWidget`/`setState` plus Flutter's built-in listeners.
class AuthController extends ChangeNotifier {
  AuthController(this._repository);

  final AuthRepository _repository;

  AuthStatus _status = AuthStatus.initializing;
  UserProfile? _user;
  bool _submitting = false;
  String? _errorMessage;

  AuthStatus get status => _status;
  UserProfile? get user => _user;
  bool get isAuthenticated => _status == AuthStatus.authenticated;
  bool get isSubmitting => _submitting;
  String? get errorMessage => _errorMessage;

  /// Whether a previously stored session exists; drives the splash decision.
  Future<bool> hasStoredSession() => _repository.tokenStore.hasStoredSession();

  /// Restores a persisted session at app launch. A stored session is only
  /// considered valid once the server confirms the access token (via
  /// `GET /auth/me`, retrying once through a refresh when needed).
  Future<void> restoreSession() async {
    _status = AuthStatus.initializing;
    _user = null;
    _errorMessage = null;
    notifyListeners();

    if (!await _repository.tokenStore.hasStoredSession()) {
      _setUnauthenticated();
      return;
    }

    var user = await _tryGetMe();
    if (user == null) {
      // The access token was rejected; a single refresh rotation may fix it.
      final refreshed = await _repository.refreshSession();
      if (refreshed != null) {
        user = refreshed.user;
      } else {
        await _repository.tokenStore.clear();
      }
    }

    if (user != null) {
      _status = AuthStatus.authenticated;
      _user = user;
    } else {
      _setUnauthenticated();
    }
    notifyListeners();
  }

  Future<void> login({required String email, required String password}) async {
    await _submit(() => _repository.login(email: email, password: password));
  }

  Future<void> register({
    required String name,
    required String email,
    required String password,
  }) async {
    await _submit(() => _repository.register(name: name, email: email, password: password));
  }

  Future<void> logout() async {
    await _repository.logout();
    _setUnauthenticated();
  }

  /// Clears the session without notifying the server (used when the session
  /// is already known to be invalid after a failed refresh).
  Future<void> clearSession() async {
    await _repository.tokenStore.clear();
    _setUnauthenticated();
  }

  /// Refresh primitive called by the shared [ApiClient] on an expired access
  /// token for a read-only request.
  Future<bool> refreshSession() async {
    final session = await _repository.refreshSession();
    if (session != null) {
      if (_user == null || _user!.id != session.user.id) {
        _user = session.user;
      }
      _status = AuthStatus.authenticated;
      _errorMessage = null;
      notifyListeners();
      return true;
    }
    return false;
  }

  /// Called by the shared [ApiClient] when a session can no longer be
  /// refreshed. Clears state and returns to the unauthenticated view.
  Future<void> forceSessionExpired() => clearSession();

  Future<UserProfile?> _tryGetMe() async {
    try {
      return await _repository.getMe();
    } catch (_) {
      return null;
    }
  }

  Future<void> _submit(Future<AuthSession> Function() action) async {
    _submitting = true;
    _errorMessage = null;
    notifyListeners();
    try {
      final session = await action();
      _user = session.user;
      _status = AuthStatus.authenticated;
    } catch (error) {
      _errorMessage = appErrorMessage(error);
      rethrow;
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  void _setUnauthenticated() {
    _status = AuthStatus.unauthenticated;
    _user = null;
    _errorMessage = null;
  }
}
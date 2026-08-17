import 'package:shared_preferences/shared_preferences.dart';

/// Thin wrapper around SharedPreferences so feature code depends on this
/// abstraction instead of the plugin directly. Swap in secure storage (e.g.
/// for tokens) behind the same interface later if needed.
class LocalStorage {
  LocalStorage(this._prefs);

  final SharedPreferences _prefs;

  String? getString(String key) => _prefs.getString(key);

  Future<bool> setString(String key, String value) =>
      _prefs.setString(key, value);

  Future<bool> remove(String key) => _prefs.remove(key);
}

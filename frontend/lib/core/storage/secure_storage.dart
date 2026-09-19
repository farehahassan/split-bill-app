import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Abstraction over platform-secure credential storage so feature code never
/// depends on a concrete plugin. Unit tests supply [InMemorySecureStorage].
abstract class SecureStorage {
  Future<String?> getString(String key);
  Future<bool> setString(String key, String value);
  Future<bool> remove(String key);
}

/// Production implementation backed by [FlutterSecureStorage].
class FlutterSecureStorageImpl implements SecureStorage {
  FlutterSecureStorageImpl([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  @override
  Future<String?> getString(String key) => _storage.read(key: key);

  @override
  Future<bool> setString(String key, String value) async {
    await _storage.write(key: key, value: value);
    return true;
  }

  @override
  Future<bool> remove(String key) async {
    await _storage.delete(key: key);
    return true;
  }
}

/// In-memory [SecureStorage] for unit tests (no native plugin required).
class InMemorySecureStorage implements SecureStorage {
  final Map<String, String> _data = {};

  @override
  Future<String?> getString(String key) async => _data[key];

  @override
  Future<bool> setString(String key, String value) async {
    _data[key] = value;
    return true;
  }

  @override
  Future<bool> remove(String key) async {
    _data.remove(key);
    return true;
  }
}
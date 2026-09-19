import 'dart:math';

/// Generates client-side idempotency keys for financial mutations.
///
/// The backend requires an `Idempotency-Key` header for settlement creation:
/// between 8 and 128 characters using only `A-Za-z0-9._-`. A key must be
/// generated once per logical operation and REUSED when the same operation is
/// retried, so the backend can de-duplicate a retry (e.g. an ack lost to a
/// network timeout). This generator only produces new keys — callers are
/// responsible for keeping a key stable across retries of one operation.
String generateIdempotencyKey({Random? random}) {
  final rng = random ?? Random.secure();
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789';
  final timestamp = DateTime.now().microsecondsSinceEpoch;
  final randomPart = List.generate(12, (_) => alphabet[rng.nextInt(alphabet.length)]).join();
  return 'ky_${timestamp}_$randomPart';
}
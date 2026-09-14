import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:split_bill_app/core/network/idempotency_key.dart';

void main() {
  test('generated keys match the backend charset and length rules', () {
    final key = generateIdempotencyKey(random: Random(42));
    final pattern = RegExp(r'^[A-Za-z0-9._-]{8,128}$');
    expect(pattern.hasMatch(key), isTrue, reason: 'key was "$key"');
  });

  test('keys are unique across many calls', () {
    final keys = {
      for (var i = 0; i < 500; i++) generateIdempotencyKey(random: Random(i)),
    };
    expect(keys.length, 500);
  });

  test('two keys for the same instant on two random streams differ', () {
    final a = generateIdempotencyKey(random: Random(1));
    final b = generateIdempotencyKey(random: Random(2));
    expect(a, isNot(equals(b)));
  });
}
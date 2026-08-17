import 'package:intl/intl.dart';

import '../constants/app_constants.dart';

/// A currency amount stored in integer minor units (paisa) to avoid
/// floating-point rounding errors in financial calculations.
class Money {
  const Money(this.minorUnits, {this.currencyCode = AppConstants.currencyCode});

  final int minorUnits;
  final String currencyCode;

  static const Money zero = Money(0);

  static final NumberFormat _formatter = NumberFormat.currency(
    symbol: '${AppConstants.currencySymbol} ',
    decimalDigits: 0,
  );

  /// Parses a user-entered amount such as "1200", "1,200.50" or "4500.5".
  /// Throws [FormatException] when the input is not a valid amount.
  factory Money.parse(String input, {String? currencyCode}) {
    final cleaned = input.replaceAll(RegExp(r'[,\s]'), '');
    if (!RegExp(r'^-?\d+(\.\d{1,2})?$').hasMatch(cleaned)) {
      throw const FormatException('Enter a valid amount');
    }
    final negative = cleaned.startsWith('-');
    final unsigned = negative ? cleaned.substring(1) : cleaned;
    final parts = unsigned.split('.');
    final whole = int.parse(parts[0]);
    final fraction = parts.length > 1 ? parts[1].padRight(2, '0') : '00';
    var value = whole * 100 + int.parse(fraction);
    if (negative) value = -value;
    return Money(
      value,
      currencyCode: currencyCode ?? AppConstants.currencyCode,
    );
  }

  Money operator +(Money other) {
    assert(
      currencyCode == other.currencyCode,
      'Cannot add different currencies',
    );
    return Money(minorUnits + other.minorUnits, currencyCode: currencyCode);
  }

  Money operator -(Money other) {
    assert(
      currencyCode == other.currencyCode,
      'Cannot subtract different currencies',
    );
    return Money(minorUnits - other.minorUnits, currencyCode: currencyCode);
  }

  Money operator -() => Money(-minorUnits, currencyCode: currencyCode);

  bool get isNegative => minorUnits < 0;

  /// Formats as whole currency units, e.g. "PKR 1,250" / "-PKR 1,250".
  /// Amounts are rounded to the nearest whole unit for display.
  String format() => _formatter.format(minorUnits / 100);

  @override
  bool operator ==(Object other) =>
      other is Money &&
      other.minorUnits == minorUnits &&
      other.currencyCode == currencyCode;

  @override
  int get hashCode => Object.hash(minorUnits, currencyCode);

  @override
  String toString() => format();
}

/// Splits [amount] into [parts] equal shares using integer arithmetic.
///
/// The remainder (`amount % parts`) is distributed one minor unit at a time
/// to the first shares so the shares always sum exactly back to [amount].
/// Example: PKR 1000 / 3 -> PKR 334, PKR 333, PKR 333.
List<Money> splitEqually(Money amount, int parts) {
  if (parts <= 0) {
    throw ArgumentError.value(
      parts,
      'parts',
      'Must split into at least one part',
    );
  }
  final base = amount.minorUnits ~/ parts;
  final remainder = amount.minorUnits % parts;
  return List.generate(
    parts,
    (index) => Money(
      base + (index < remainder ? 1 : 0),
      currencyCode: amount.currencyCode,
    ),
  );
}

import 'package:flutter_test/flutter_test.dart';
import 'package:split_bill_app/core/utils/money.dart';

void main() {
  group('Money.parse', () {
    test('parses whole numbers into minor units', () {
      expect(Money.parse('1200'), const Money(120000));
    });

    test('parses decimals with one or two digits', () {
      expect(Money.parse('1200.5'), const Money(120050));
      expect(Money.parse('1200.05'), const Money(120005));
    });

    test('ignores commas and spaces', () {
      expect(Money.parse('1,200.50'), const Money(120050));
    });

    test('rejects invalid input', () {
      expect(() => Money.parse('abc'), throwsFormatException);
      expect(() => Money.parse('12.345'), throwsFormatException);
      expect(() => Money.parse(''), throwsFormatException);
      expect(() => Money.parse('12..5'), throwsFormatException);
    });
  });

  group('Money arithmetic', () {
    test('adds and subtracts', () {
      expect(const Money(100) + const Money(50), const Money(150));
      expect(const Money(100) - const Money(50), const Money(50));
      expect(-const Money(50), const Money(-50));
    });

    test('implements value equality and hashCode', () {
      expect(const Money(100), const Money(100));
      expect(const Money(100).hashCode, const Money(100).hashCode);
      expect(const Money(100) == const Money(101), isFalse);
    });

    test('formats as whole PKR units', () {
      expect(const Money(125000).format(), 'PKR 1,250');
      expect(const Money(-125000).format(), '-PKR 1,250');
      expect(const Money(0).format(), 'PKR 0');
    });
  });

  group('splitEqually', () {
    test('distributes the remainder to the first shares (1000 / 3)', () {
      final shares = splitEqually(const Money(1000), 3);
      expect(shares, const [Money(334), Money(333), Money(333)]);
    });

    test('splits evenly when divisible', () {
      final shares = splitEqually(const Money(900), 3);
      expect(shares, const [Money(300), Money(300), Money(300)]);
    });

    test('shares always sum back to the original amount', () {
      final amount = const Money(100000);
      final shares = splitEqually(amount, 7);
      final sum = shares.fold<int>(0, (acc, share) => acc + share.minorUnits);
      expect(sum, amount.minorUnits);
    });

    test('single part returns the whole amount', () {
      expect(splitEqually(const Money(500), 1), const [Money(500)]);
    });

    test('rejects zero or negative parts', () {
      expect(() => splitEqually(const Money(500), 0), throwsArgumentError);
      expect(() => splitEqually(const Money(500), -1), throwsArgumentError);
    });
  });
}

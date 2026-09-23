import '../../../../core/utils/money.dart';

/// A member's net balance within a group, matching the backend balance entity.
///
/// A positive amount means the member is a net creditor (is owed money); a
/// negative amount means the member is a net debtor (owes money). The sum of all
/// member balances in a group is always exactly zero.
class Balance {
  const Balance({
    required this.userId,
    required this.name,
    required this.email,
    required this.amountMinorUnits,
  });

  final String userId;
  final String name;
  final String email;
  final int amountMinorUnits;

  Money get amount => Money(amountMinorUnits);

  bool get isCreditor => amountMinorUnits > 0;
  bool get isDebtor => amountMinorUnits < 0;
  bool get isSettled => amountMinorUnits == 0;

  static Balance fromJson(Map<String, dynamic> json) {
    return Balance(
      userId: json['userId'] as String,
      name: json['name'] as String,
      email: json['email'] as String,
      amountMinorUnits: json['amountMinorUnits'] as int,
    );
  }

  Map<String, dynamic> toJson() => {
        'userId': userId,
        'name': name,
        'email': email,
        'amountMinorUnits': amountMinorUnits,
      };

  Balance copyWith({
    String? userId,
    String? name,
    String? email,
    int? amountMinorUnits,
  }) {
    return Balance(
      userId: userId ?? this.userId,
      name: name ?? this.name,
      email: email ?? this.email,
      amountMinorUnits: amountMinorUnits ?? this.amountMinorUnits,
    );
  }

  @override
  String toString() =>
      'Balance(userId: $userId, name: $name, amountMinorUnits: $amountMinorUnits)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Balance &&
          other.userId == userId &&
          other.name == name &&
          other.email == email &&
          other.amountMinorUnits == amountMinorUnits;

  @override
  int get hashCode => Object.hash(userId, name, email, amountMinorUnits);
}

/// Backwards-compatible alias for [Balance].
typedef GroupBalance = Balance;

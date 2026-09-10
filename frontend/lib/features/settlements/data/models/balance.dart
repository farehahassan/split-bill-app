import '../../../../core/utils/money.dart';

/// A member's net balance within a group, as returned by
/// `GET /groups/:id/balances`.
///
/// A positive amount means the member is a net creditor (is owed money); a
/// negative amount means the member is a net debtor (owes money). Sum of all
/// member balances in a group is always exactly zero.
class GroupBalance {
  const GroupBalance({
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

  static GroupBalance fromJson(Map<String, dynamic> json) {
    return GroupBalance(
      userId: json['userId'] as String,
      name: json['name'] as String,
      email: json['email'] as String,
      amountMinorUnits: json['amountMinorUnits'] as int,
    );
  }
}
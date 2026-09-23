import '../../../../core/utils/money.dart';
import '../../../expenses/data/models/expense.dart';

/// A settlement between two group members, matching the backend's settlement
/// payload.
class Settlement {
  const Settlement({
    required this.id,
    required this.groupId,
    required this.payerId,
    required this.payeeId,
    required this.amountMinorUnits,
    required this.currencyCode,
    required this.settledAt,
    required this.createdAt,
    required this.updatedAt,
    required this.payer,
    required this.payee,
  });

  final String id;
  final String groupId;
  final String payerId;
  final String payeeId;
  final int amountMinorUnits;
  final String currencyCode;
  final DateTime settledAt;
  final DateTime createdAt;
  final DateTime updatedAt;
  final ExpenseUser payer;
  final ExpenseUser payee;

  Money get amount => Money(amountMinorUnits, currencyCode: currencyCode);

  static Settlement fromJson(Map<String, dynamic> json) {
    return Settlement(
      id: json['id'] as String,
      groupId: json['groupId'] as String,
      payerId: json['payerId'] as String,
      payeeId: json['payeeId'] as String,
      amountMinorUnits: json['amountMinorUnits'] as int,
      currencyCode: json['currencyCode'] as String? ?? 'PKR',
      settledAt: DateTime.parse(json['settledAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      payer: ExpenseUser.fromJson(json['payer'] as Map<String, dynamic>),
      payee: ExpenseUser.fromJson(json['payee'] as Map<String, dynamic>),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'groupId': groupId,
        'payerId': payerId,
        'payeeId': payeeId,
        'amountMinorUnits': amountMinorUnits,
        'currencyCode': currencyCode,
        'settledAt': settledAt.toIso8601String(),
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
        'payer': payer.toJson(),
        'payee': payee.toJson(),
      };

  Settlement copyWith({
    String? id,
    String? groupId,
    String? payerId,
    String? payeeId,
    int? amountMinorUnits,
    String? currencyCode,
    DateTime? settledAt,
    DateTime? createdAt,
    DateTime? updatedAt,
    ExpenseUser? payer,
    ExpenseUser? payee,
  }) {
    return Settlement(
      id: id ?? this.id,
      groupId: groupId ?? this.groupId,
      payerId: payerId ?? this.payerId,
      payeeId: payeeId ?? this.payeeId,
      amountMinorUnits: amountMinorUnits ?? this.amountMinorUnits,
      currencyCode: currencyCode ?? this.currencyCode,
      settledAt: settledAt ?? this.settledAt,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      payer: payer ?? this.payer,
      payee: payee ?? this.payee,
    );
  }

  @override
  String toString() =>
      'Settlement(id: $id, amount: $amountMinorUnits $currencyCode, payer: ${payer.name}, payee: ${payee.name})';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Settlement &&
          other.id == id &&
          other.groupId == groupId &&
          other.payerId == payerId &&
          other.payeeId == payeeId &&
          other.amountMinorUnits == amountMinorUnits &&
          other.currencyCode == currencyCode &&
          other.settledAt == settledAt &&
          other.payer == payer &&
          other.payee == payee;

  @override
  int get hashCode => Object.hash(
        id,
        groupId,
        payerId,
        payeeId,
        amountMinorUnits,
        currencyCode,
        settledAt,
        payer,
        payee,
      );
}

/// Request payload for `POST /groups/:id/settlements`.
class CreateSettlementRequest {
  const CreateSettlementRequest({
    required this.payerId,
    required this.payeeId,
    required this.amountMinorUnits,
    required this.idempotencyKey,
  });

  final String payerId;
  final String payeeId;
  final int amountMinorUnits;
  final String idempotencyKey;

  Map<String, dynamic> toJson() => {
        'payerId': payerId,
        'payeeId': payeeId,
        'amountMinorUnits': amountMinorUnits,
      };
}

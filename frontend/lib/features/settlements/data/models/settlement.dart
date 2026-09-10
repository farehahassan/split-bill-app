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
      currencyCode: json['currencyCode'] as String,
      settledAt: DateTime.parse(json['settledAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      payer: ExpenseUser.fromJson(json['payer'] as Map<String, dynamic>),
      payee: ExpenseUser.fromJson(json['payee'] as Map<String, dynamic>),
    );
  }
}

/// Request payload for `POST /groups/:id/settlements`.
///
/// Money is always integer minor units. The caller supplies a stable
/// [idempotencyKey] so retrying the same logical operation cannot create a
/// duplicate settlement on the backend.
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
}
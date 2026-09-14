import '../../../../core/utils/money.dart';

/// Member reference included in expenses, matching `{ id, name, email }`.
class ExpenseUser {
  const ExpenseUser({required this.id, required this.name, required this.email});

  final String id;
  final String name;
  final String email;

  static ExpenseUser fromJson(Map<String, dynamic> json) {
    return ExpenseUser(
      id: json['id'] as String,
      name: json['name'] as String,
      email: json['email'] as String,
    );
  }
}

/// A single participant split within an expense detail.
class ExpenseSplit {
  const ExpenseSplit({
    required this.id,
    required this.userId,
    required this.amountMinorUnits,
    required this.user,
  });

  final String id;
  final String userId;
  final int amountMinorUnits;
  final ExpenseUser user;

  Money get amount => Money(amountMinorUnits, currencyCode: 'PKR');

  static ExpenseSplit fromJson(Map<String, dynamic> json) {
    return ExpenseSplit(
      id: json['id'] as String,
      userId: json['userId'] as String,
      amountMinorUnits: json['amountMinorUnits'] as int,
      user: ExpenseUser.fromJson(json['user'] as Map<String, dynamic>),
    );
  }
}

/// Expense list item as returned by `GET /groups/:id/expenses`.
class ExpenseSummary {
  const ExpenseSummary({
    required this.id,
    required this.groupId,
    required this.paidById,
    required this.description,
    required this.amountMinorUnits,
    required this.currencyCode,
    required this.splitType,
    required this.expenseDate,
    required this.payer,
    required this.splitCount,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String groupId;
  final String paidById;
  final String description;
  final int amountMinorUnits;
  final String currencyCode;
  final String splitType;
  final DateTime expenseDate;
  final ExpenseUser payer;
  final int splitCount;
  final DateTime createdAt;
  final DateTime updatedAt;

  Money get amount => Money(amountMinorUnits, currencyCode: currencyCode);

  static ExpenseSummary fromJson(Map<String, dynamic> json) {
    return ExpenseSummary(
      id: json['id'] as String,
      groupId: json['groupId'] as String,
      paidById: json['paidById'] as String,
      description: json['description'] as String,
      amountMinorUnits: json['amountMinorUnits'] as int,
      currencyCode: json['currencyCode'] as String,
      splitType: json['splitType'] as String,
      expenseDate: DateTime.parse(json['expenseDate'] as String),
      payer: ExpenseUser.fromJson(json['payer'] as Map<String, dynamic>),
      splitCount: json['splitCount'] as int,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }
}

/// Full expense as returned by `POST /groups/:id/expenses` and
/// `GET /expenses/:id`.
class ExpenseDetail {
  const ExpenseDetail({
    required this.id,
    required this.groupId,
    required this.paidById,
    required this.description,
    required this.amountMinorUnits,
    required this.currencyCode,
    required this.splitType,
    required this.expenseDate,
    required this.payer,
    required this.splits,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String groupId;
  final String paidById;
  final String description;
  final int amountMinorUnits;
  final String currencyCode;
  final String splitType;
  final DateTime expenseDate;
  final ExpenseUser payer;
  final List<ExpenseSplit> splits;
  final DateTime createdAt;
  final DateTime updatedAt;

  Money get amount => Money(amountMinorUnits, currencyCode: currencyCode);

  static ExpenseDetail fromJson(Map<String, dynamic> json) {
    return ExpenseDetail(
      id: json['id'] as String,
      groupId: json['groupId'] as String,
      paidById: json['paidById'] as String,
      description: json['description'] as String,
      amountMinorUnits: json['amountMinorUnits'] as int,
      currencyCode: json['currencyCode'] as String,
      splitType: json['splitType'] as String,
      expenseDate: DateTime.parse(json['expenseDate'] as String),
      payer: ExpenseUser.fromJson(json['payer'] as Map<String, dynamic>),
      splits: (json['splits'] as List<dynamic>)
          .map((e) => ExpenseSplit.fromJson(e as Map<String, dynamic>))
          .toList(),
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }
}

/// Request payload for `POST /groups/:id/expenses`.
///
/// Money is always transmitted as integer minor units; splits use the same
/// convention. For `EQUAL` splits no per-participant amounts are sent.
class CreateExpenseRequest {
  const CreateExpenseRequest({
    required this.description,
    required this.amountMinorUnits,
    required this.payerId,
    required this.splitType,
    required this.participants,
    this.expenseDate,
  });

  final String description;
  final int amountMinorUnits;
  final String payerId;

  /// `EQUAL` | `EXACT`.
  final String splitType;
  final List<ExpenseParticipant> participants;

  /// ISO-8601 timestamp with offset (optional; the backend defaults to now).
  final DateTime? expenseDate;

  Map<String, dynamic> toJson() => {
    'description': description,
    'amountMinorUnits': amountMinorUnits,
    'payerId': payerId,
    'splitType': splitType,
    'participants': participants.map((p) => p.toJson()).toList(),
    if (expenseDate != null) 'expenseDate': expenseDate!.toUtc().toIso8601String(),
  };
}

class ExpenseParticipant {
  const ExpenseParticipant({required this.userId, this.amountMinorUnits});

  final String userId;
  final int? amountMinorUnits;

  Map<String, dynamic> toJson() => {
    'userId': userId,
    if (amountMinorUnits != null) 'amountMinorUnits': amountMinorUnits,
  };
}
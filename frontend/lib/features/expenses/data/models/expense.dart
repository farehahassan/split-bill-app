import '../../../../core/utils/money.dart';

/// Member reference included in expenses, matching `{ id, name, email }`.
class ExpenseUser {
  const ExpenseUser({
    required this.id,
    required this.name,
    required this.email,
  });

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

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
      };

  ExpenseUser copyWith({
    String? id,
    String? name,
    String? email,
  }) {
    return ExpenseUser(
      id: id ?? this.id,
      name: name ?? this.name,
      email: email ?? this.email,
    );
  }

  @override
  String toString() => 'ExpenseUser(id: $id, name: $name, email: $email)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ExpenseUser &&
          other.id == id &&
          other.name == name &&
          other.email == email;

  @override
  int get hashCode => Object.hash(id, name, email);
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

  Map<String, dynamic> toJson() => {
        'id': id,
        'userId': userId,
        'amountMinorUnits': amountMinorUnits,
        'user': user.toJson(),
      };

  ExpenseSplit copyWith({
    String? id,
    String? userId,
    int? amountMinorUnits,
    ExpenseUser? user,
  }) {
    return ExpenseSplit(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      amountMinorUnits: amountMinorUnits ?? this.amountMinorUnits,
      user: user ?? this.user,
    );
  }

  @override
  String toString() =>
      'ExpenseSplit(id: $id, userId: $userId, amountMinorUnits: $amountMinorUnits)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ExpenseSplit &&
          other.id == id &&
          other.userId == userId &&
          other.amountMinorUnits == amountMinorUnits &&
          other.user == user;

  @override
  int get hashCode => Object.hash(id, userId, amountMinorUnits, user);
}

/// Full expense matching the backend entity.
class Expense {
  const Expense({
    required this.id,
    required this.groupId,
    required this.paidById,
    required this.description,
    required this.amountMinorUnits,
    required this.currencyCode,
    required this.splitType,
    required this.expenseDate,
    required this.payer,
    this.splits = const [],
    this.splitCount,
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
  final int? splitCount;
  final DateTime createdAt;
  final DateTime updatedAt;

  Money get amount => Money(amountMinorUnits, currencyCode: currencyCode);

  int get effectiveSplitCount => splitCount ?? splits.length;

  static Expense fromJson(Map<String, dynamic> json) {
    final rawSplits = json['splits'] as List<dynamic>?;
    final splitsList = rawSplits != null
        ? rawSplits
            .map((e) => ExpenseSplit.fromJson(e as Map<String, dynamic>))
            .toList()
        : const <ExpenseSplit>[];
    return Expense(
      id: json['id'] as String,
      groupId: json['groupId'] as String,
      paidById: json['paidById'] as String,
      description: json['description'] as String,
      amountMinorUnits: json['amountMinorUnits'] as int,
      currencyCode: json['currencyCode'] as String? ?? 'PKR',
      splitType: json['splitType'] as String,
      expenseDate: DateTime.parse(json['expenseDate'] as String),
      payer: ExpenseUser.fromJson(json['payer'] as Map<String, dynamic>),
      splits: splitsList,
      splitCount: json['splitCount'] as int? ?? splitsList.length,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'groupId': groupId,
        'paidById': paidById,
        'description': description,
        'amountMinorUnits': amountMinorUnits,
        'currencyCode': currencyCode,
        'splitType': splitType,
        'expenseDate': expenseDate.toIso8601String(),
        'payer': payer.toJson(),
        'splits': splits.map((s) => s.toJson()).toList(),
        if (splitCount != null) 'splitCount': splitCount,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
      };

  Expense copyWith({
    String? id,
    String? groupId,
    String? paidById,
    String? description,
    int? amountMinorUnits,
    String? currencyCode,
    String? splitType,
    DateTime? expenseDate,
    ExpenseUser? payer,
    List<ExpenseSplit>? splits,
    int? splitCount,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return Expense(
      id: id ?? this.id,
      groupId: groupId ?? this.groupId,
      paidById: paidById ?? this.paidById,
      description: description ?? this.description,
      amountMinorUnits: amountMinorUnits ?? this.amountMinorUnits,
      currencyCode: currencyCode ?? this.currencyCode,
      splitType: splitType ?? this.splitType,
      expenseDate: expenseDate ?? this.expenseDate,
      payer: payer ?? this.payer,
      splits: splits ?? this.splits,
      splitCount: splitCount ?? this.splitCount,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  @override
  String toString() =>
      'Expense(id: $id, description: $description, amount: $amountMinorUnits $currencyCode)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Expense &&
          other.id == id &&
          other.groupId == groupId &&
          other.paidById == paidById &&
          other.description == description &&
          other.amountMinorUnits == amountMinorUnits &&
          other.currencyCode == currencyCode &&
          other.splitType == splitType &&
          other.expenseDate == expenseDate &&
          other.payer == payer &&
          other.createdAt == createdAt &&
          other.updatedAt == updatedAt;

  @override
  int get hashCode => Object.hash(
        id,
        groupId,
        paidById,
        description,
        amountMinorUnits,
        currencyCode,
        splitType,
        expenseDate,
        payer,
        createdAt,
        updatedAt,
      );
}

/// Backwards-compatible alias for full expense detail.
typedef ExpenseDetail = Expense;

/// Expense list item as returned by `GET /groups/:id/expenses`.
class ExpenseSummary extends Expense {
  const ExpenseSummary({
    required super.id,
    required super.groupId,
    required super.paidById,
    required super.description,
    required super.amountMinorUnits,
    required super.currencyCode,
    required super.splitType,
    required super.expenseDate,
    required super.payer,
    required int splitCount,
    required super.createdAt,
    required super.updatedAt,
  }) : super(splitCount: splitCount);

  @override
  int get splitCount => super.splitCount ?? 0;

  static ExpenseSummary fromJson(Map<String, dynamic> json) {
    return ExpenseSummary(
      id: json['id'] as String,
      groupId: json['groupId'] as String,
      paidById: json['paidById'] as String,
      description: json['description'] as String,
      amountMinorUnits: json['amountMinorUnits'] as int,
      currencyCode: json['currencyCode'] as String? ?? 'PKR',
      splitType: json['splitType'] as String,
      expenseDate: DateTime.parse(json['expenseDate'] as String),
      payer: ExpenseUser.fromJson(json['payer'] as Map<String, dynamic>),
      splitCount: json['splitCount'] as int? ?? 0,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }
}

/// Request payload for `POST /groups/:id/expenses`.
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
        if (expenseDate != null)
          'expenseDate': expenseDate!.toUtc().toIso8601String(),
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

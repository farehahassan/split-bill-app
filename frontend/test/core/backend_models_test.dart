import 'package:flutter_test/flutter_test.dart';
import 'package:split_bill_app/core/models/models.dart';

void main() {
  group('User Model', () {
    test('fromJson, toJson, copyWith, and equality', () {
      final json = {
        'id': 'u1',
        'name': 'Ahmed Raza',
        'email': 'ahmed@example.com',
      };
      final user = User.fromJson(json);

      expect(user.id, 'u1');
      expect(user.name, 'Ahmed Raza');
      expect(user.email, 'ahmed@example.com');
      expect(user.initials, 'AR');
      expect(user.toJson(), json);

      final updated = user.copyWith(name: 'Ahmed Khan');
      expect(updated.name, 'Ahmed Khan');
      expect(updated.id, 'u1');
      expect(updated, isNot(equals(user)));

      final duplicate = User.fromJson(json);
      expect(user, equals(duplicate));
      expect(user.hashCode, equals(duplicate.hashCode));
    });

    test('UserProfile typedef alias compatibility', () {
      const UserProfile profile = UserProfile(
        id: 'u2',
        name: 'Fatima Ali',
        email: 'fatima@example.com',
      );
      expect(profile, isA<User>());
      expect(profile.initials, 'FA');
    });
  });

  group('Group and GroupMember Models', () {
    test('Group fromJson, toJson, and copyWith', () {
      final now = DateTime.parse('2026-09-24T00:00:00.000Z');
      final json = {
        'id': 'g1',
        'name': 'Trip to Naran',
        'createdById': 'u1',
        'memberCount': 4,
        'createdAt': now.toIso8601String(),
        'updatedAt': now.toIso8601String(),
      };
      final group = Group.fromJson(json);

      expect(group.id, 'g1');
      expect(group.name, 'Trip to Naran');
      expect(group.memberCount, 4);
      expect(group.createdAt, now);
      expect(group.toJson(), json);

      final modified = group.copyWith(name: 'Trip to Hunza');
      expect(modified.name, 'Trip to Hunza');
      expect(modified.memberCount, 4);
      expect(group, equals(Group.fromJson(json)));
    });

    test('GroupMember fromJson, toJson, and equality', () {
      final json = {
        'id': 'm1',
        'name': 'Bilal',
        'email': 'bilal@example.com',
      };
      final member = GroupMember.fromJson(json);

      expect(member.id, 'm1');
      expect(member.name, 'Bilal');
      expect(member.email, 'bilal@example.com');
      expect(member.toJson(), json);
      expect(member, equals(GroupMember.fromJson(json)));
    });

    test('GroupDetail parses members and checks membership', () {
      final now = DateTime.parse('2026-09-24T00:00:00.000Z');
      final json = {
        'id': 'g1',
        'name': 'Dinner Group',
        'createdById': 'u1',
        'createdAt': now.toIso8601String(),
        'updatedAt': now.toIso8601String(),
        'members': [
          {'id': 'u1', 'name': 'Ahmed', 'email': 'ahmed@example.com'},
          {'id': 'u2', 'name': 'Sara', 'email': 'sara@example.com'},
        ],
      };
      final detail = GroupDetail.fromJson(json);

      expect(detail.members.length, 2);
      expect(detail.isMember('u1'), isTrue);
      expect(detail.isMember('u3'), isFalse);
      expect(detail.toGroup().memberCount, 2);
    });

    test('GroupMemberRecord parses correctly', () {
      final now = DateTime.parse('2026-09-24T00:00:00.000Z');
      final json = {
        'id': 'rec1',
        'groupId': 'g1',
        'userId': 'u1',
        'createdAt': now.toIso8601String(),
      };
      final record = GroupMemberRecord.fromJson(json);
      expect(record.id, 'rec1');
      expect(record.groupId, 'g1');
      expect(record.userId, 'u1');
      expect(record.createdAt, now);
      expect(record.toJson(), json);
    });
  });

  group('Expense and ExpenseSplit Models', () {
    test('ExpenseSplit fromJson, toJson, amount, and equality', () {
      final json = {
        'id': 's1',
        'userId': 'u2',
        'amountMinorUnits': 500,
        'user': {'id': 'u2', 'name': 'Sara', 'email': 'sara@example.com'},
      };
      final split = ExpenseSplit.fromJson(json);

      expect(split.id, 's1');
      expect(split.userId, 'u2');
      expect(split.amountMinorUnits, 500);
      expect(split.amount.minorUnits, 500);
      expect(split.user.name, 'Sara');
      expect(split.toJson(), json);
      expect(split, equals(ExpenseSplit.fromJson(json)));
    });

    test('Expense fromJson, toJson, and money calculation', () {
      final now = DateTime.parse('2026-09-24T00:00:00.000Z');
      final json = {
        'id': 'e1',
        'groupId': 'g1',
        'paidById': 'u1',
        'description': 'Dinner',
        'amountMinorUnits': 1500,
        'currencyCode': 'PKR',
        'splitType': 'EQUAL',
        'expenseDate': now.toIso8601String(),
        'payer': {'id': 'u1', 'name': 'Ahmed', 'email': 'ahmed@example.com'},
        'splits': [
          {
            'id': 's1',
            'userId': 'u1',
            'amountMinorUnits': 750,
            'user': {'id': 'u1', 'name': 'Ahmed', 'email': 'ahmed@example.com'},
          },
          {
            'id': 's2',
            'userId': 'u2',
            'amountMinorUnits': 750,
            'user': {'id': 'u2', 'name': 'Sara', 'email': 'sara@example.com'},
          },
        ],
        'splitCount': 2,
        'createdAt': now.toIso8601String(),
        'updatedAt': now.toIso8601String(),
      };
      final expense = Expense.fromJson(json);

      expect(expense.id, 'e1');
      expect(expense.description, 'Dinner');
      expect(expense.amountMinorUnits, 1500);
      expect(expense.amount.minorUnits, 1500);
      expect(expense.splits.length, 2);
      expect(expense.effectiveSplitCount, 2);
      expect(expense.toJson(), json);
    });

    test('ExpenseSummary parses splitCount row', () {
      final now = DateTime.parse('2026-09-24T00:00:00.000Z');
      final json = {
        'id': 'e2',
        'groupId': 'g1',
        'paidById': 'u1',
        'description': 'Snacks',
        'amountMinorUnits': 300,
        'currencyCode': 'PKR',
        'splitType': 'EQUAL',
        'expenseDate': now.toIso8601String(),
        'payer': {'id': 'u1', 'name': 'Ahmed', 'email': 'ahmed@example.com'},
        'splitCount': 3,
        'createdAt': now.toIso8601String(),
        'updatedAt': now.toIso8601String(),
      };
      final summary = ExpenseSummary.fromJson(json);

      expect(summary.id, 'e2');
      expect(summary.splitCount, 3);
      expect(summary.amount.minorUnits, 300);
    });

    test('CreateExpenseRequest builds valid JSON', () {
      final req = CreateExpenseRequest(
        description: 'Fuel',
        amountMinorUnits: 2000,
        payerId: 'u1',
        splitType: 'EQUAL',
        participants: const [
          ExpenseParticipant(userId: 'u1'),
          ExpenseParticipant(userId: 'u2'),
        ],
      );
      final json = req.toJson();
      expect(json['description'], 'Fuel');
      expect(json['amountMinorUnits'], 2000);
      expect(json['payerId'], 'u1');
      expect((json['participants'] as List).length, 2);
    });
  });

  group('Balance Model', () {
    test('fromJson, toJson, and creditor/debtor flags', () {
      final creditorJson = {
        'userId': 'u1',
        'name': 'Ahmed',
        'email': 'ahmed@example.com',
        'amountMinorUnits': 1200,
      };
      final creditor = Balance.fromJson(creditorJson);
      expect(creditor.isCreditor, isTrue);
      expect(creditor.isDebtor, isFalse);
      expect(creditor.isSettled, isFalse);
      expect(creditor.amount.minorUnits, 1200);
      expect(creditor.toJson(), creditorJson);

      final debtorJson = {
        'userId': 'u2',
        'name': 'Sara',
        'email': 'sara@example.com',
        'amountMinorUnits': -1200,
      };
      final debtor = Balance.fromJson(debtorJson);
      expect(debtor.isCreditor, isFalse);
      expect(debtor.isDebtor, isTrue);
      expect(debtor.isSettled, isFalse);

      final settledJson = {
        'userId': 'u3',
        'name': 'Zain',
        'email': 'zain@example.com',
        'amountMinorUnits': 0,
      };
      final settled = Balance.fromJson(settledJson);
      expect(settled.isSettled, isTrue);

      // GroupBalance alias compatibility
      const GroupBalance groupBal = GroupBalance(
        userId: 'u1',
        name: 'Ahmed',
        email: 'ahmed@example.com',
        amountMinorUnits: 500,
      );
      expect(groupBal, isA<Balance>());
    });
  });

  group('Settlement Model', () {
    test('fromJson, toJson, copyWith, and equality', () {
      final now = DateTime.parse('2026-09-24T00:00:00.000Z');
      final json = {
        'id': 'set1',
        'groupId': 'g1',
        'payerId': 'u2',
        'payeeId': 'u1',
        'amountMinorUnits': 1200,
        'currencyCode': 'PKR',
        'settledAt': now.toIso8601String(),
        'createdAt': now.toIso8601String(),
        'updatedAt': now.toIso8601String(),
        'payer': {'id': 'u2', 'name': 'Sara', 'email': 'sara@example.com'},
        'payee': {'id': 'u1', 'name': 'Ahmed', 'email': 'ahmed@example.com'},
      };
      final settlement = Settlement.fromJson(json);

      expect(settlement.id, 'set1');
      expect(settlement.amountMinorUnits, 1200);
      expect(settlement.amount.minorUnits, 1200);
      expect(settlement.payer.name, 'Sara');
      expect(settlement.payee.name, 'Ahmed');
      expect(settlement.toJson(), json);
      expect(settlement, equals(Settlement.fromJson(json)));
    });

    test('CreateSettlementRequest builds valid JSON', () {
      const req = CreateSettlementRequest(
        payerId: 'u2',
        payeeId: 'u1',
        amountMinorUnits: 1200,
        idempotencyKey: 'ky_12345678_abcdefgh',
      );
      final json = req.toJson();
      expect(json['payerId'], 'u2');
      expect(json['payeeId'], 'u1');
      expect(json['amountMinorUnits'], 1200);
      expect(req.idempotencyKey, 'ky_12345678_abcdefgh');
    });
  });

  group('ActivityEvent Model', () {
    test('fromJson, toJson, and event classification', () {
      final now = DateTime.parse('2026-09-24T00:00:00.000Z');
      final json = {
        'id': 'act1',
        'groupId': 'g1',
        'userId': 'u1',
        'type': 'EXPENSE_ADDED',
        'message': 'added expense "Dinner"',
        'amountMinorUnits': 1500,
        'currencyCode': 'PKR',
        'occurredAt': now.toIso8601String(),
        'createdAt': now.toIso8601String(),
        'user': {
          'id': 'u1',
          'name': 'Ahmed Raza',
          'email': 'ahmed@example.com'
        },
      };
      final event = ActivityEvent.fromJson(json);

      expect(event.id, 'act1');
      expect(event.userName, 'Ahmed Raza');
      expect(event.isExpense, isTrue);
      expect(event.isSettlement, isFalse);
      expect(event.amount?.minorUnits, 1500);

      final copy = event.copyWith(message: 'updated expense');
      expect(copy.message, 'updated expense');
    });

    test('ActivityFeedPage and ActivityPagination', () {
      final paginationJson = {'page': 1, 'limit': 10, 'total': 25};
      final pagination = ActivityPagination.fromJson(paginationJson);

      expect(pagination.page, 1);
      expect(pagination.limit, 10);
      expect(pagination.total, 25);
      expect(pagination.hasMore, isTrue);

      final page = ActivityFeedPage.fromJson(
        events: const [],
        paginationJson: paginationJson,
      );
      expect(page.events, isEmpty);
      expect(page.pagination.total, 25);
    });
  });
}

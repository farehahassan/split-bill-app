import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:split_bill_app/core/network/api_client.dart';
import 'package:split_bill_app/features/activity/data/datasources/activity_remote_data_source.dart';
import 'package:split_bill_app/features/auth/data/datasources/auth_remote_data_source.dart';
import 'package:split_bill_app/features/expenses/data/datasources/expenses_remote_data_source.dart';
import 'package:split_bill_app/features/expenses/data/models/expense.dart';
import 'package:split_bill_app/features/groups/data/datasources/groups_remote_data_source.dart';
import 'package:split_bill_app/features/settlements/data/datasources/settlements_remote_data_source.dart';
import 'package:split_bill_app/features/settlements/data/models/settlement.dart';

import '../helpers/fake_http_adapter.dart';

void main() {
  late FakeHttpAdapter adapter;
  late ApiClient client;

  setUp(() {
    adapter = FakeHttpAdapter((o) => null);
    final dio = Dio(BaseOptions(baseUrl: 'http://test.local'));
    dio.httpClientAdapter = adapter;
    client = ApiClient(
      baseUrl: 'http://test.local',
      dio: dio,
    );
  });

  Map<String, Object?> envelope(Object? data) => {
    'success': true,
    if (data != null) 'data': data,
  };

  Map<String, Object?> wrapped(String key, Object? value) =>
      envelope({key: value});

  Map<String, Object?> expenseSummaryJson(String id) => {
    'id': id,
    'groupId': 'g1',
    'paidById': 'u1',
    'description': 'Dinner $id',
    'amountMinorUnits': 1000,
    'currencyCode': 'PKR',
    'splitType': 'EQUAL',
    'expenseDate': '2026-06-01T10:00:00Z',
    'createdAt': '2026-06-01T10:00:00Z',
    'updatedAt': '2026-06-01T10:00:00Z',
    'payer': {'id': 'u1', 'name': 'Ali', 'email': 'a@b.c'},
    'splitCount': 2,
  };

  Map<String, Object?> settlementJson(String id) => {
    'id': id,
    'groupId': 'g1',
    'payerId': 'u1',
    'payeeId': 'u2',
    'amountMinorUnits': 1000,
    'currencyCode': 'PKR',
    'settledAt': '2026-06-01T10:00:00Z',
    'createdAt': '2026-06-01T10:00:00Z',
    'updatedAt': '2026-06-01T10:00:00Z',
    'payer': {'id': 'u1', 'name': 'Ali', 'email': 'a@b.c'},
    'payee': {'id': 'u2', 'name': 'Sana', 'email': 's@b.c'},
  };

  test('auth login posts credentials and parses the session', () async {
    adapter.handle = (o) => o.path == '/auth/login'
        ? FakeResponse(
            200,
            envelope({
              'user': {'id': 'u1', 'name': 'Ali', 'email': 'ali@example.com'},
              'token': 'access-1',
              'refreshToken': 'refresh-1',
            }),
          )
        : null;

    final ds = AuthRemoteDataSource(client);
    final session = await ds.login(email: 'ali@example.com', password: 'secret123');

    expect(adapter.requests.single.path, '/auth/login');
    expect(adapter.requests.single.data, {
      'email': 'ali@example.com',
      'password': 'secret123',
    });
    expect(session.user.name, 'Ali');
    expect(session.accessToken, 'access-1');
    expect(session.refreshToken, 'refresh-1');
  });

  test('auth register sends name/email/password', () async {
    adapter.handle = (o) => o.path == '/auth/register'
        ? FakeResponse(201, envelope({'user': {'id': 'u1', 'name': 'Ali', 'email': 'a@b.c'}, 'token': 't', 'refreshToken': 'r'}))
        : null;

    final ds = AuthRemoteDataSource(client);
    await ds.register(name: 'Ali', email: 'a@b.c', password: 'secret123');

    expect(adapter.requests.single.path, '/auth/register');
    expect(adapter.requests.single.data, {
      'name': 'Ali',
      'email': 'a@b.c',
      'password': 'secret123',
    });
  });

  test('auth refresh posts the refresh token for rotation', () async {
    adapter.handle = (o) => o.path == '/auth/refresh'
        ? FakeResponse(
            200,
            envelope({'user': {'id': 'u1', 'name': 'Ali', 'email': 'a@b.c'}, 'token': 'a2', 'refreshToken': 'r2'}),
          )
        : null;

    final ds = AuthRemoteDataSource(client);
    final session = await ds.refresh(refreshToken: 'r1');

    expect(adapter.requests.single.path, '/auth/refresh');
    expect(adapter.requests.single.data, {'refreshToken': 'r1'});
    expect(session.refreshToken, 'r2');
  });

  test('groups list parses summaries with memberCount', () async {
    adapter.handle = (o) => o.path == '/groups'
        ? FakeResponse(
            200,
            envelope({
              'groups': [
                {
                  'id': 'g1',
                  'name': 'Naran Trip',
                  'createdById': 'u1',
                  'memberCount': 4,
                  'createdAt': '2026-01-01T10:00:00Z',
                  'updatedAt': '2026-01-02T10:00:00Z',
                },
              ],
            }),
          )
        : null;

    final groups = await GroupsRemoteDataSource(client).getGroups();
    expect(groups, hasLength(1));
    expect(groups.single.name, 'Naran Trip');
    expect(groups.single.memberCount, 4);
  });

  test('groups create posts the name and parses the group', () async {
    adapter.handle = (o) => o.path == '/groups'
        ? FakeResponse(
            201,
            wrapped('group', {
              'id': 'g9',
              'name': 'Trip',
              'createdById': 'u1',
              'memberCount': 1,
              'createdAt': '2026-01-01T10:00:00Z',
              'updatedAt': '2026-01-01T10:00:00Z',
            }),
          )
        : null;

    final created = await GroupsRemoteDataSource(client).createGroup(name: 'Trip');
    expect(adapter.requests.single.path, '/groups');
    expect(adapter.requests.single.data, {'name': 'Trip'});
    expect(created.id, 'g9');
  });

  test('group detail parses the member list', () async {
    adapter.handle = (o) => o.path == '/groups/g1'
        ? FakeResponse(
            200,
            wrapped('group', {
              'id': 'g1',
              'name': 'Naran Trip',
              'createdById': 'u1',
              'createdAt': '2026-01-01T10:00:00Z',
              'updatedAt': '2026-01-02T10:00:00Z',
              'members': [
                {'id': 'u1', 'name': 'Ali', 'email': 'ali@example.com'},
                {'id': 'u2', 'name': 'Sana', 'email': 'sana@example.com'},
              ],
            }),
          )
        : null;

    final detail = await GroupsRemoteDataSource(client).getGroup('g1');
    expect(detail.members, hasLength(2));
    expect(detail.isMember('u2'), isTrue);
  });

    test('expense create sends equal split and parses splits', () async {
    adapter.handle = (o) => o.path == '/groups/g1/expenses'
        ? FakeResponse(
            201,
            wrapped('expense', {
              'id': 'e1',
              'groupId': 'g1',
              'paidById': 'u1',
              'description': 'Dinner',
              'amountMinorUnits': 250000,
              'currencyCode': 'PKR',
              'splitType': 'EQUAL',
              'expenseDate': '2026-06-01T10:00:00Z',
              'createdAt': '2026-06-01T10:00:00Z',
              'updatedAt': '2026-06-01T10:00:00Z',
              'payer': {'id': 'u1', 'name': 'Ali', 'email': 'ali@example.com'},
              'splits': [
                {
                  'id': 's1',
                  'userId': 'u1',
                  'amountMinorUnits': 125000,
                  'user': {'id': 'u1', 'name': 'Ali', 'email': 'ali@example.com'},
                },
                {
                  'id': 's2',
                  'userId': 'u2',
                  'amountMinorUnits': 125000,
                  'user': {'id': 'u2', 'name': 'Sana', 'email': 'sana@example.com'},
                },
              ],
            }),
          )
        : null;

    final ds = ExpensesRemoteDataSource(client);
    final detail = await ds.createExpense(
      groupId: 'g1',
      request: CreateExpenseRequest(
        description: 'Dinner',
        amountMinorUnits: 250000,
        payerId: 'u1',
        splitType: 'EQUAL',
        participants: const [
          ExpenseParticipant(userId: 'u1'),
          ExpenseParticipant(userId: 'u2'),
        ],
      ),
    );

    expect(adapter.requests.single.path, '/groups/g1/expenses');
    expect(adapter.requests.single.data['amountMinorUnits'], 250000);
    expect(adapter.requests.single.data['splitType'], 'EQUAL');
    expect(adapter.requests.single.data['participants'], hasLength(2));
    expect(detail.splits, hasLength(2));
    expect(detail.amount.minorUnits, 250000);
  });

  test('expense list parses summary rows', () async {
    adapter.handle = (o) => o.path == '/groups/g1/expenses'
        ? FakeResponse(
            200,
            envelope({
              'expenses': [
                {
                  'id': 'e1',
                  'groupId': 'g1',
                  'paidById': 'u1',
                  'description': 'Dinner',
                  'amountMinorUnits': 250000,
                  'currencyCode': 'PKR',
                  'splitType': 'EQUAL',
                  'expenseDate': '2026-06-01T10:00:00Z',
                  'createdAt': '2026-06-01T10:00:00Z',
                  'updatedAt': '2026-06-01T10:00:00Z',
                  'payer': {'id': 'u1', 'name': 'Ali', 'email': 'ali@example.com'},
                  'splitCount': 2,
                },
              ],
            }),
          )
        : null;

    final expenses = await ExpensesRemoteDataSource(client).getGroupExpenses('g1');
    expect(expenses.single.splitCount, 2);
    expect(expenses.single.payer.name, 'Ali');
  });

  test('expense list pages through all pages when the server paginates', () async {
    final pageSize = ExpensesRemoteDataSource.pageSize;
    var calls = 0;
    adapter.handle = (o) {
      if (o.path != '/groups/g1/expenses') return null;
      calls++;
      final page = o.queryParameters['page'];
      if (page == 1) {
        return FakeResponse(
          200,
          {
            'success': true,
            'data': {'expenses': List.generate(pageSize, (i) => expenseSummaryJson('e$i'))},
            'pagination': {'page': 1, 'limit': pageSize, 'total': pageSize + 1},
          },
        );
      }
      return FakeResponse(
        200,
        {
          'success': true,
          'data': {'expenses': [expenseSummaryJson('last')]},
          'pagination': {'page': 2, 'limit': pageSize, 'total': pageSize + 1},
        },
      );
    };

    final expenses = await ExpensesRemoteDataSource(client).getGroupExpenses('g1');

    expect(expenses, hasLength(pageSize + 1));
    expect(calls, 2);
    final pages = adapter.requests.map((r) => r.queryParameters['page']).toList();
    expect(pages, containsAll([1, 2]));
    expect(expenses.last.id, 'last');
  });

  test('balances parse signed creditor/debtor semantics', () async {
    adapter.handle = (o) => o.path == '/groups/g1/balances'
        ? FakeResponse(
            200,
            envelope({
              'balances': [
                {'userId': 'u1', 'name': 'Ali', 'email': 'a@b.c', 'amountMinorUnits': 50000},
                {'userId': 'u2', 'name': 'Sana', 'email': 's@b.c', 'amountMinorUnits': -50000},
              ],
            }),
          )
        : null;

    final balances = await SettlementsRemoteDataSource(client).getGroupBalances('g1');
    expect(balances.singleWhere((b) => b.userId == 'u1').isCreditor, isTrue);
    expect(balances.singleWhere((b) => b.userId == 'u2').isDebtor, isTrue);
  });

  test('settlement create sends the Idempotency-Key header and payload', () async {
        adapter.handle = (o) => o.path == '/groups/g1/settlements'
        ? FakeResponse(
            201,
            wrapped('settlement', {
              'id': 'st1',
              'groupId': 'g1',
              'payerId': 'u1',
              'payeeId': 'u2',
              'amountMinorUnits': 50000,
              'currencyCode': 'PKR',
              'settledAt': '2026-06-01T10:00:00Z',
              'createdAt': '2026-06-01T10:00:00Z',
              'updatedAt': '2026-06-01T10:00:00Z',
              'payer': {'id': 'u1', 'name': 'Ali', 'email': 'a@b.c'},
              'payee': {'id': 'u2', 'name': 'Sana', 'email': 's@b.c'},
            }),
          )
        : null;

    final ds = SettlementsRemoteDataSource(client);
    final settlement = await ds.createSettlement(
      groupId: 'g1',
      request: const CreateSettlementRequest(
        payerId: 'u1',
        payeeId: 'u2',
        amountMinorUnits: 50000,
        idempotencyKey: 'ky_1234567890_ABCDEFGHIJKL',
      ),
    );

    final request = adapter.requests.single;
    expect(request.path, '/groups/g1/settlements');
    expect(request.headers['Idempotency-Key'], 'ky_1234567890_ABCDEFGHIJKL');
    expect(request.data, {'payerId': 'u1', 'payeeId': 'u2', 'amountMinorUnits': 50000});
    expect(settlement.payer.name, 'Ali');
  });

  test('settlement list parses settlements', () async {
    adapter.handle = (o) => o.path == '/groups/g1/settlements'
        ? FakeResponse(200, envelope({'settlements': <Object?>[]}))
        : null;

    final settlements = await SettlementsRemoteDataSource(client).getGroupSettlements('g1');
    expect(settlements, isEmpty);
  });

  test('settlement list pages through all pages when the server paginates', () async {
    final pageSize = SettlementsRemoteDataSource.pageSize;
    var calls = 0;
    adapter.handle = (o) {
      if (o.path != '/groups/g1/settlements') return null;
      calls++;
      final page = o.queryParameters['page'];
      if (page == 1) {
        return FakeResponse(
          200,
          {
            'success': true,
            'data': {
              'settlements': List.generate(pageSize, (i) => settlementJson('s$i')),
            },
            'pagination': {'page': 1, 'limit': pageSize, 'total': pageSize + 1},
          },
        );
      }
      return FakeResponse(
        200,
        {
          'success': true,
          'data': {'settlements': [settlementJson('last')]},
          'pagination': {'page': 2, 'limit': pageSize, 'total': pageSize + 1},
        },
      );
    };

    final settlements =
        await SettlementsRemoteDataSource(client).getGroupSettlements('g1');

    expect(settlements, hasLength(pageSize + 1));
    expect(calls, 2);
    expect(settlements.last.id, 'last');
  });

  test('activity feed requests pagination query and parses events + pagination', () async {
    adapter.handle = (o) => o.path == '/groups/g1/activity'
        ? FakeResponse(
            200,
            {
              'success': true,
              'data': {
                'events': [
                  {
                    'id': 'ev1',
                    'groupId': 'g1',
                    'userId': 'u1',
                    'type': 'EXPENSE_ADDED',
                    'message': 'Ali added expense Dinner worth PKR 2,500',
                    'amountMinorUnits': 250000,
                    'currencyCode': 'PKR',
                    'occurredAt': '2026-06-01T10:00:00Z',
                    'createdAt': '2026-06-01T10:00:00Z',
                    'user': {'id': 'u1', 'name': 'Ali', 'email': 'a@b.c'},
                  },
                ],
              },
              'pagination': {'page': 1, 'limit': 20, 'total': 1},
            },
          )
        : null;

    final page = await ActivityRemoteDataSource(client).getGroupActivity(
      groupId: 'g1',
      page: 1,
      limit: 20,
    );

    final request = adapter.requests.single;
    expect(request.queryParameters['page'], 1);
    expect(request.queryParameters['limit'], 20);
    expect(page.events, hasLength(1));
    expect(page.events.single.type, 'EXPENSE_ADDED');
    expect(page.pagination.total, 1);
    expect(page.pagination.hasMore, isFalse);
  });
}
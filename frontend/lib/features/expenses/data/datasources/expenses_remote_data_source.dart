import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_envelope.dart';
import '../models/expense.dart';

/// Data source for the expenses API.
///
/// Contract (from the backend routes):
///   POST /groups/:id/expenses -> 201 { expense }
///   GET  /groups/:id/expenses -> 200 { expenses } (+ page/limit query)
///   GET  /expenses/:id        -> 200 { expense }
class ExpensesRemoteDataSource {
  ExpensesRemoteDataSource(this._client);

  /// Largest `limit` the backend accepts. Full-list fetches page through in
  /// chunks of this size so no single request is unbounded.
  static const int pageSize = 50;

  final ApiClient _client;

  Future<ExpenseDetail> createExpense({
    required String groupId,
    required CreateExpenseRequest request,
  }) async {
    final decoded = await _client.post(
      '/groups/$groupId/expenses',
      data: request.toJson(),
    );
    final data = unwrapApiData(decoded) as Map<String, dynamic>;
    return ExpenseDetail.fromJson(data['expense'] as Map<String, dynamic>);
  }

  Future<List<ExpenseSummary>> getGroupExpenses(String groupId) async {
    final all = <ExpenseSummary>[];
    var page = 1;
    while (true) {
      final decoded = await _client.get(
        '/groups/$groupId/expenses',
        queryParameters: {'page': page, 'limit': pageSize},
      );
      final data = unwrapApiData(decoded) as Map<String, dynamic>;
      final items = (data['expenses'] as List<dynamic>)
          .map((e) => ExpenseSummary.fromJson(e as Map<String, dynamic>))
          .toList();
      all.addAll(items);

      // A response without pagination metadata means the server returned the
      // whole list in one shot; stop rather than risk an unbounded loop.
      final pagination = unwrapPagination(decoded);
      if (pagination == null) break;

      final total = pagination['total'];
      if (items.length < pageSize || (total is int && all.length >= total)) {
        break;
      }
      page++;
    }
    return all;
  }

  Future<ExpenseDetail> getExpense(String expenseId) async {
    final decoded = await _client.get('/expenses/$expenseId');
    final data = unwrapApiData(decoded) as Map<String, dynamic>;
    return ExpenseDetail.fromJson(data['expense'] as Map<String, dynamic>);
  }
}
import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_envelope.dart';
import '../models/expense.dart';

/// Data source for the expenses API.
///
/// Contract (from the backend routes):
///   POST /groups/:id/expenses -> 201 { expense }
///   GET  /groups/:id/expenses -> 200 { expenses }
///   GET  /expenses/:id        -> 200 { expense }
class ExpensesRemoteDataSource {
  ExpensesRemoteDataSource(this._client);

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
    final decoded = await _client.get('/groups/$groupId/expenses');
    final data = unwrapApiData(decoded) as Map<String, dynamic>;
    return (data['expenses'] as List<dynamic>)
        .map((e) => ExpenseSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<ExpenseDetail> getExpense(String expenseId) async {
    final decoded = await _client.get('/expenses/$expenseId');
    final data = unwrapApiData(decoded) as Map<String, dynamic>;
    return ExpenseDetail.fromJson(data['expense'] as Map<String, dynamic>);
  }
}
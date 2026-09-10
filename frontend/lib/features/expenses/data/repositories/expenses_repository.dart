import '../datasources/expenses_remote_data_source.dart';
import '../models/expense.dart';

/// Application-facing boundary for expense operations.
abstract class ExpensesRepository {
  Future<List<ExpenseSummary>> getGroupExpenses(String groupId);
  Future<ExpenseDetail> getExpense(String expenseId);
  Future<ExpenseDetail> createExpense(String groupId, CreateExpenseRequest request);
}

class ExpensesRepositoryImpl implements ExpensesRepository {
  ExpensesRepositoryImpl(this._remote);

  final ExpensesRemoteDataSource _remote;

  @override
  Future<List<ExpenseSummary>> getGroupExpenses(String groupId) =>
      _remote.getGroupExpenses(groupId);

  @override
  Future<ExpenseDetail> getExpense(String expenseId) => _remote.getExpense(expenseId);

  @override
  Future<ExpenseDetail> createExpense(String groupId, CreateExpenseRequest request) =>
      _remote.createExpense(groupId: groupId, request: request);
}
import '../datasources/settlements_remote_data_source.dart';
import '../models/balance.dart';
import '../models/settlement.dart';

/// Application-facing boundary for balances and settlement operations.
///
/// Settlement creation is a financial mutation: the repository never retries —
/// callers supply a stable [CreateSettlementRequest.idempotencyKey] and reuse
/// it when re-attempting the same logical operation.
abstract class SettlementsRepository {
  Future<List<GroupBalance>> getGroupBalances(String groupId);
  Future<List<Settlement>> getGroupSettlements(String groupId);
  Future<Settlement> getSettlement(String settlementId);
  Future<Settlement> createSettlement(String groupId, CreateSettlementRequest request);
}

class SettlementsRepositoryImpl implements SettlementsRepository {
  SettlementsRepositoryImpl(this._remote);

  final SettlementsRemoteDataSource _remote;

  @override
  Future<List<GroupBalance>> getGroupBalances(String groupId) =>
      _remote.getGroupBalances(groupId);

  @override
  Future<List<Settlement>> getGroupSettlements(String groupId) =>
      _remote.getGroupSettlements(groupId);

  @override
  Future<Settlement> getSettlement(String settlementId) =>
      _remote.getSettlement(settlementId);

  @override
  Future<Settlement> createSettlement(String groupId, CreateSettlementRequest request) =>
      _remote.createSettlement(groupId: groupId, request: request);
}
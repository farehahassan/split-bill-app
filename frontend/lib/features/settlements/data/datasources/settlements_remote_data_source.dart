import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_envelope.dart';
import '../models/balance.dart';
import '../models/settlement.dart';

/// Data source for the group balances and settlements API.
///
/// Contract (from the backend routes):
///   GET  /groups/:id/balances                -> 200 { balances }
///   POST /groups/:id/settlements             -> 201 { settlement }  (requires
///                                                     `Idempotency-Key` header)
///   GET  /groups/:id/settlements             -> 200 { settlements }
///   GET  /settlements/:id                    -> 200 { settlement }
class SettlementsRemoteDataSource {
  SettlementsRemoteDataSource(this._client);

  static const String idempotencyKeyHeader = 'Idempotency-Key';

  final ApiClient _client;

  Future<List<GroupBalance>> getGroupBalances(String groupId) async {
    final decoded = await _client.get('/groups/$groupId/balances');
    final data = unwrapApiData(decoded) as Map<String, dynamic>;
    return (data['balances'] as List<dynamic>)
        .map((e) => GroupBalance.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Settlement> createSettlement({
    required String groupId,
    required CreateSettlementRequest request,
  }) async {
    final decoded = await _client.post(
      '/groups/$groupId/settlements',
      data: {
        'payerId': request.payerId,
        'payeeId': request.payeeId,
        'amountMinorUnits': request.amountMinorUnits,
      },
      headers: {idempotencyKeyHeader: request.idempotencyKey},
    );
    final data = unwrapApiData(decoded) as Map<String, dynamic>;
    return Settlement.fromJson(data['settlement'] as Map<String, dynamic>);
  }

  Future<List<Settlement>> getGroupSettlements(String groupId) async {
    final decoded = await _client.get('/groups/$groupId/settlements');
    final data = unwrapApiData(decoded) as Map<String, dynamic>;
    return (data['settlements'] as List<dynamic>)
        .map((e) => Settlement.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Settlement> getSettlement(String settlementId) async {
    final decoded = await _client.get('/settlements/$settlementId');
    final data = unwrapApiData(decoded) as Map<String, dynamic>;
    return Settlement.fromJson(data['settlement'] as Map<String, dynamic>);
  }
}
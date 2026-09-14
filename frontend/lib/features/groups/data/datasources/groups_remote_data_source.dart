import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_envelope.dart';
import '../models/group.dart';

/// Data source for the groups API.
///
/// Contract (from the backend routes):
///   POST   /groups                     -> 201 { group }
///   GET    /groups                     -> 200 { groups }
///   GET    /groups/:id                 -> 200 { group }
///   PUT    /groups/:id                 -> 200 { group }
///   DELETE /groups/:id                 -> 204
///   POST   /groups/:id/members         -> 201 { member }
///   DELETE /groups/:id/members/:memberId -> 204
class GroupsRemoteDataSource {
  GroupsRemoteDataSource(this._client);

  final ApiClient _client;

  Future<GroupSummary> createGroup({required String name}) async {
    final decoded = await _client.post('/groups', data: {'name': name});
    final data = unwrapApiData(decoded) as Map<String, dynamic>;
    return GroupSummary.fromJson(data['group'] as Map<String, dynamic>);
  }

  Future<List<GroupSummary>> getGroups() async {
    final decoded = await _client.get('/groups');
    final data = unwrapApiData(decoded) as Map<String, dynamic>;
    return (data['groups'] as List<dynamic>)
        .map((e) => GroupSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<GroupDetail> getGroup(String groupId) async {
    final decoded = await _client.get('/groups/$groupId');
    final data = unwrapApiData(decoded) as Map<String, dynamic>;
    return GroupDetail.fromJson(data['group'] as Map<String, dynamic>);
  }

  Future<GroupSummary> updateGroup({required String groupId, required String name}) async {
    final decoded = await _client.put('/groups/$groupId', data: {'name': name});
    final data = unwrapApiData(decoded) as Map<String, dynamic>;
    return GroupSummary.fromJson(data['group'] as Map<String, dynamic>);
  }

  Future<void> deleteGroup(String groupId) async {
    await _client.delete('/groups/$groupId');
  }

  Future<GroupMemberRecord> addMember({
    required String groupId,
    required String userId,
  }) async {
    final decoded = await _client.post(
      '/groups/$groupId/members',
      data: {'userId': userId},
    );
    final data = unwrapApiData(decoded) as Map<String, dynamic>;
    return GroupMemberRecord.fromJson(data['member'] as Map<String, dynamic>);
  }

  Future<void> removeMember({required String groupId, required String memberId}) async {
    await _client.delete('/groups/$groupId/members/$memberId');
  }
}
import '../datasources/groups_remote_data_source.dart';
import '../models/group.dart';

/// Application-facing boundary for group operations.
abstract class GroupsRepository {
  Future<List<GroupSummary>> getGroups();
  Future<GroupDetail> getGroup(String groupId);
  Future<GroupSummary> createGroup(String name);
  Future<GroupSummary> updateGroup(String groupId, String name);
  Future<void> deleteGroup(String groupId);
  Future<GroupMemberRecord> addMember(String groupId, String userId);
  Future<void> removeMember(String groupId, String memberId);
}

class GroupsRepositoryImpl implements GroupsRepository {
  GroupsRepositoryImpl(this._remote);

  final GroupsRemoteDataSource _remote;

  @override
  Future<List<GroupSummary>> getGroups() => _remote.getGroups();

  @override
  Future<GroupDetail> getGroup(String groupId) => _remote.getGroup(groupId);

  @override
  Future<GroupSummary> createGroup(String name) => _remote.createGroup(name: name);

  @override
  Future<GroupSummary> updateGroup(String groupId, String name) =>
      _remote.updateGroup(groupId: groupId, name: name);

  @override
  Future<void> deleteGroup(String groupId) => _remote.deleteGroup(groupId);

  @override
  Future<GroupMemberRecord> addMember(String groupId, String userId) =>
      _remote.addMember(groupId: groupId, userId: userId);

  @override
  Future<void> removeMember(String groupId, String memberId) =>
      _remote.removeMember(groupId: groupId, memberId: memberId);
}
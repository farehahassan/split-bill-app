import '../datasources/activity_remote_data_source.dart';
import '../models/activity_event.dart';

/// Application-facing boundary for the group activity feed.
abstract class ActivityRepository {
  Future<ActivityFeedPage> getGroupActivity({
    required String groupId,
    int page,
    int limit,
  });
}

class ActivityRepositoryImpl implements ActivityRepository {
  ActivityRepositoryImpl(this._remote);

  final ActivityRemoteDataSource _remote;

  @override
  Future<ActivityFeedPage> getGroupActivity({
    required String groupId,
    int page = 1,
    int limit = 20,
  }) {
    return _remote.getGroupActivity(groupId: groupId, page: page, limit: limit);
  }
}
import '../../../../core/network/api_client.dart';
import '../../../../core/network/api_envelope.dart';
import '../models/activity_event.dart';

/// Data source for the group activity feed.
///
/// Contract (from the backend route):
///   GET /groups/:id/activity?page=1&limit=20
///     -> 200 { success: true, data: { events: [...] },
///              pagination: { page, limit, total } }
///
/// Query parameters default server-side (page=1, limit=20;
/// limit is capped at 50).
class ActivityRemoteDataSource {
  ActivityRemoteDataSource(this._client);

  final ApiClient _client;

  Future<ActivityFeedPage> getGroupActivity({
    required String groupId,
    int page = 1,
    int limit = 20,
  }) async {
    final decoded = await _client.get(
      '/groups/$groupId/activity',
      queryParameters: {'page': page, 'limit': limit},
    );
    final data = unwrapApiData(decoded) as Map<String, dynamic>;
    final events = (data['events'] as List<dynamic>)
        .map((e) => ActivityEvent.fromJson(e as Map<String, dynamic>))
        .toList();
    final paginationJson = unwrapPagination(decoded);
    if (paginationJson == null) {
      // Defensive: pagination is part of the contract; treat as a single page.
      return ActivityFeedPage(
        events: events,
        pagination: ActivityPagination(page: page, limit: limit, total: events.length),
      );
    }
    return ActivityFeedPage.fromJson(events: events, paginationJson: paginationJson);
  }
}
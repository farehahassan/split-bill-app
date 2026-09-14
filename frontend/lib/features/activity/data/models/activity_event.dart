import '../../../../core/utils/money.dart';

/// A single activity event, matching the backend's event payload.
class ActivityEvent {
  const ActivityEvent({
    required this.id,
    required this.groupId,
    required this.userId,
    required this.type,
    required this.message,
    required this.amountMinorUnits,
    required this.currencyCode,
    required this.occurredAt,
    required this.createdAt,
    required this.userName,
  });

  final String id;
  final String groupId;
  final String userId;

  /// `EXPENSE_ADDED` | `SETTLEMENT_ADDED` | `GROUP_CREATED` | `MEMBER_ADDED`.
  final String type;
  final String message;

  /// Null for group/member events; the signed amount in minor units otherwise.
  final int? amountMinorUnits;
  final String? currencyCode;
  final DateTime occurredAt;
  final DateTime createdAt;
  final String userName;

  bool get isExpense => type == 'EXPENSE_ADDED';
  bool get isSettlement => type == 'SETTLEMENT_ADDED';

  Money? get amount {
    final units = amountMinorUnits;
    if (units == null) return null;
    return Money(units, currencyCode: currencyCode ?? 'PKR');
  }

  static ActivityEvent fromJson(Map<String, dynamic> json) {
    final user = json['user'] as Map<String, dynamic>;
    return ActivityEvent(
      id: json['id'] as String,
      groupId: json['groupId'] as String,
      userId: json['userId'] as String,
      type: json['type'] as String,
      message: json['message'] as String,
      amountMinorUnits: json['amountMinorUnits'] as int?,
      currencyCode: json['currencyCode'] as String?,
      occurredAt: DateTime.parse(json['occurredAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
      userName: user['name'] as String,
    );
  }
}

class ActivityPagination {
  const ActivityPagination({
    required this.page,
    required this.limit,
    required this.total,
  });

  final int page;
  final int limit;
  final int total;

  bool get hasMore => page * limit < total;

  static ActivityPagination fromJson(Map<String, dynamic> json) {
    return ActivityPagination(
      page: json['page'] as int,
      limit: json['limit'] as int,
      total: json['total'] as int,
    );
  }
}

/// One page of the activity feed. The backend returns the current page's
/// events plus top-level pagination metadata.
class ActivityFeedPage {
  const ActivityFeedPage({required this.events, required this.pagination});

  final List<ActivityEvent> events;
  final ActivityPagination pagination;

  static ActivityFeedPage fromJson({
    required List<ActivityEvent> events,
    required Map<String, dynamic> paginationJson,
  }) {
    return ActivityFeedPage(
      events: events,
      pagination: ActivityPagination.fromJson(paginationJson),
    );
  }
}
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
    String name = 'Member';
    if (json['user'] is Map) {
      name = (json['user'] as Map)['name'] as String? ?? 'Member';
    } else if (json['userName'] is String) {
      name = json['userName'] as String;
    }

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
      userName: name,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'groupId': groupId,
        'userId': userId,
        'type': type,
        'message': message,
        'amountMinorUnits': amountMinorUnits,
        'currencyCode': currencyCode,
        'occurredAt': occurredAt.toIso8601String(),
        'createdAt': createdAt.toIso8601String(),
        'user': {'id': userId, 'name': userName, 'email': ''},
      };

  ActivityEvent copyWith({
    String? id,
    String? groupId,
    String? userId,
    String? type,
    String? message,
    int? amountMinorUnits,
    String? currencyCode,
    DateTime? occurredAt,
    DateTime? createdAt,
    String? userName,
  }) {
    return ActivityEvent(
      id: id ?? this.id,
      groupId: groupId ?? this.groupId,
      userId: userId ?? this.userId,
      type: type ?? this.type,
      message: message ?? this.message,
      amountMinorUnits: amountMinorUnits ?? this.amountMinorUnits,
      currencyCode: currencyCode ?? this.currencyCode,
      occurredAt: occurredAt ?? this.occurredAt,
      createdAt: createdAt ?? this.createdAt,
      userName: userName ?? this.userName,
    );
  }

  @override
  String toString() =>
      'ActivityEvent(id: $id, type: $type, user: $userName, message: $message)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ActivityEvent &&
          other.id == id &&
          other.groupId == groupId &&
          other.userId == userId &&
          other.type == type &&
          other.message == message &&
          other.amountMinorUnits == amountMinorUnits &&
          other.currencyCode == currencyCode &&
          other.occurredAt == occurredAt &&
          other.userName == userName;

  @override
  int get hashCode => Object.hash(
        id,
        groupId,
        userId,
        type,
        message,
        amountMinorUnits,
        currencyCode,
        occurredAt,
        userName,
      );
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

  Map<String, dynamic> toJson() => {
        'page': page,
        'limit': limit,
        'total': total,
      };

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ActivityPagination &&
          other.page == page &&
          other.limit == limit &&
          other.total == total;

  @override
  int get hashCode => Object.hash(page, limit, total);
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

  Map<String, dynamic> toJson() => {
        'events': events.map((e) => e.toJson()).toList(),
        'pagination': pagination.toJson(),
      };

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ActivityFeedPage &&
          other.pagination == pagination &&
          _listEquals(other.events, events);

  @override
  int get hashCode => Object.hash(pagination, Object.hashAll(events));

  static bool _listEquals(List<ActivityEvent> a, List<ActivityEvent> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }
}

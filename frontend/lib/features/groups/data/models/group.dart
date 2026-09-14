/// A group in the user's active-groups list (backend list payload).
class GroupSummary {
  const GroupSummary({
    required this.id,
    required this.name,
    required this.createdById,
    required this.memberCount,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String name;
  final String createdById;
  final int memberCount;
  final DateTime createdAt;
  final DateTime updatedAt;

  static GroupSummary fromJson(Map<String, dynamic> json) {
    return GroupSummary(
      id: json['id'] as String,
      name: json['name'] as String,
      createdById: json['createdById'] as String,
      memberCount: json['memberCount'] as int,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }
}

/// A group member, matching the backend's nested `{ id, name, email }` shape.
class GroupMember {
  const GroupMember({required this.id, required this.name, required this.email});

  final String id;
  final String name;
  final String email;

  static GroupMember fromJson(Map<String, dynamic> json) {
    return GroupMember(
      id: json['id'] as String,
      name: json['name'] as String,
      email: json['email'] as String,
    );
  }
}

/// Full group detail including its members (backend `GET /groups/:id`).
class GroupDetail {
  const GroupDetail({
    required this.id,
    required this.name,
    required this.createdById,
    required this.createdAt,
    required this.updatedAt,
    required this.members,
  });

  final String id;
  final String name;
  final String createdById;
  final DateTime createdAt;
  final DateTime updatedAt;
  final List<GroupMember> members;

  bool isMember(String userId) => members.any((m) => m.id == userId);

  static GroupDetail fromJson(Map<String, dynamic> json) {
    return GroupDetail(
      id: json['id'] as String,
      name: json['name'] as String,
      createdById: json['createdById'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      members: (json['members'] as List<dynamic>)
          .map((e) => GroupMember.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

/// The membership record returned by `POST /groups/:id/members`.
class GroupMemberRecord {
  const GroupMemberRecord({
    required this.id,
    required this.groupId,
    required this.userId,
    required this.createdAt,
  });

  final String id;
  final String groupId;
  final String userId;
  final DateTime createdAt;

  static GroupMemberRecord fromJson(Map<String, dynamic> json) {
    return GroupMemberRecord(
      id: json['id'] as String,
      groupId: json['groupId'] as String,
      userId: json['userId'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}
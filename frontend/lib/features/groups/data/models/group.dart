/// Represents a bill-splitting group matching the backend entity.
class Group {
  const Group({
    required this.id,
    required this.name,
    required this.createdById,
    this.memberCount = 0,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String name;
  final String createdById;
  final int memberCount;
  final DateTime createdAt;
  final DateTime updatedAt;

  static Group fromJson(Map<String, dynamic> json) {
    return Group(
      id: json['id'] as String,
      name: json['name'] as String,
      createdById: json['createdById'] as String,
      memberCount: json['memberCount'] as int? ?? 0,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'createdById': createdById,
        'memberCount': memberCount,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
      };

  Group copyWith({
    String? id,
    String? name,
    String? createdById,
    int? memberCount,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return Group(
      id: id ?? this.id,
      name: name ?? this.name,
      createdById: createdById ?? this.createdById,
      memberCount: memberCount ?? this.memberCount,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  @override
  String toString() =>
      'Group(id: $id, name: $name, createdById: $createdById, memberCount: $memberCount)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Group &&
          other.id == id &&
          other.name == name &&
          other.createdById == createdById &&
          other.memberCount == memberCount &&
          other.createdAt == createdAt &&
          other.updatedAt == updatedAt;

  @override
  int get hashCode =>
      Object.hash(id, name, createdById, memberCount, createdAt, updatedAt);
}

/// Backwards-compatible alias for group list items.
typedef GroupSummary = Group;

/// A group member, matching the backend's nested `{ id, name, email }` shape.
class GroupMember {
  const GroupMember({
    required this.id,
    required this.name,
    required this.email,
  });

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

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
      };

  GroupMember copyWith({
    String? id,
    String? name,
    String? email,
  }) {
    return GroupMember(
      id: id ?? this.id,
      name: name ?? this.name,
      email: email ?? this.email,
    );
  }

  @override
  String toString() => 'GroupMember(id: $id, name: $name, email: $email)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is GroupMember &&
          other.id == id &&
          other.name == name &&
          other.email == email;

  @override
  int get hashCode => Object.hash(id, name, email);
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

  Group toGroup() => Group(
        id: id,
        name: name,
        createdById: createdById,
        createdAt: createdAt,
        updatedAt: updatedAt,
        memberCount: members.length,
      );

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

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'createdById': createdById,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
        'members': members.map((m) => m.toJson()).toList(),
      };

  GroupDetail copyWith({
    String? id,
    String? name,
    String? createdById,
    DateTime? createdAt,
    DateTime? updatedAt,
    List<GroupMember>? members,
  }) {
    return GroupDetail(
      id: id ?? this.id,
      name: name ?? this.name,
      createdById: createdById ?? this.createdById,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      members: members ?? this.members,
    );
  }

  @override
  String toString() =>
      'GroupDetail(id: $id, name: $name, createdById: $createdById, members: ${members.length})';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is GroupDetail &&
          other.id == id &&
          other.name == name &&
          other.createdById == createdById &&
          other.createdAt == createdAt &&
          other.updatedAt == updatedAt;

  @override
  int get hashCode => Object.hash(id, name, createdById, createdAt, updatedAt);
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

  Map<String, dynamic> toJson() => {
        'id': id,
        'groupId': groupId,
        'userId': userId,
        'createdAt': createdAt.toIso8601String(),
      };

  @override
  String toString() =>
      'GroupMemberRecord(id: $id, groupId: $groupId, userId: $userId)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is GroupMemberRecord &&
          other.id == id &&
          other.groupId == groupId &&
          other.userId == userId &&
          other.createdAt == createdAt;

  @override
  int get hashCode => Object.hash(id, groupId, userId, createdAt);
}

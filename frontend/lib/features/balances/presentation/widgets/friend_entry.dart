import '../../../../mock/mock_data.dart';

/// Mutable UI state around a [MockFriend]: whether the balance has been
/// settled in the current session.
class FriendEntry {
  FriendEntry({required this.friend});

  final MockFriend friend;
  bool settled = false;
}

import '../../data/models/activity_event.dart';

/// Filter options for the activity feed.
enum ActivityFilter { all, expenses, settlements }

/// Whether [event] passes the given [filter].
bool activityMatches(ActivityEvent event, ActivityFilter filter) {
  return switch (filter) {
    ActivityFilter.all => true,
    ActivityFilter.expenses => event.isExpense,
    ActivityFilter.settlements => event.isSettlement,
  };
}
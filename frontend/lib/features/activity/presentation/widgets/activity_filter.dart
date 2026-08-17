import 'package:flutter/material.dart';

import '../../../../mock/mock_data.dart';

/// Filter options for the activity feed.
enum ActivityFilter { all, paid, received, settlements }

/// Whether [activity] passes the given [filter].
bool matchesFilter(MockActivity activity, ActivityFilter filter) {
  final isSettlement = activity.icon == Icons.swap_horiz;
  return switch (filter) {
    ActivityFilter.all => true,
    ActivityFilter.paid => !isSettlement && !activity.isInflow,
    ActivityFilter.received => activity.isInflow && !isSettlement,
    ActivityFilter.settlements => isSettlement,
  };
}

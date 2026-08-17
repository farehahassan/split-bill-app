import 'package:flutter/material.dart';

import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/entrance.dart';
import '../../../../mock/mock_data.dart';
import 'activity_filter.dart';
import 'activity_row.dart';

/// A date-grouped section of the activity feed ("Today", "Yesterday", …).
/// Empty sections are hidden.
class ActivityGroup extends StatelessWidget {
  const ActivityGroup({
    super.key,
    required this.dateLabel,
    required this.filter,
  });

  final String dateLabel;
  final ActivityFilter filter;

  @override
  Widget build(BuildContext context) {
    final activities = mockActivities
        .where((activity) => activity.dateLabel == dateLabel)
        .where((activity) => matchesFilter(activity, filter))
        .toList();
    if (activities.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: AppSpacing.small),
          child: Text(dateLabel, style: AppTextStyles.sectionTitle),
        ),
        for (final activity in activities) ...[
          Entrance(child: ActivityRow(activity: activity)),
          const SizedBox(height: AppSpacing.small),
        ],
        const SizedBox(height: AppSpacing.medium),
      ],
    );
  }
}

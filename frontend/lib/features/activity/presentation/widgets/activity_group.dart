import 'package:flutter/material.dart';

import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/entrance.dart';
import '../../data/models/activity_event.dart';
import 'activity_filter.dart';
import 'activity_row.dart';

/// A date-grouped section of the activity feed (e.g. "Today"). Empty sections
/// are hidden.
class ActivityGroup extends StatelessWidget {
  const ActivityGroup({
    super.key,
    required this.dateLabel,
    required this.filter,
    required this.events,
  });

  final String dateLabel;
  final ActivityFilter filter;
  final List<ActivityEvent> events;

  @override
  Widget build(BuildContext context) {
    final visible = events.where((event) => activityMatches(event, filter)).toList();
    if (visible.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: AppSpacing.small),
          child: Text(dateLabel, style: AppTextStyles.sectionTitle),
        ),
        for (final event in visible) ...[
          Entrance(child: ActivityRow(event: event)),
          const SizedBox(height: AppSpacing.small),
        ],
        const SizedBox(height: AppSpacing.medium),
      ],
    );
  }
}
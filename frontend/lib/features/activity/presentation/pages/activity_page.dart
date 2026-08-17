import 'package:flutter/material.dart';

import '../../../../core/theme/app_spacing.dart';
import '../../../../core/ui/responsive_content.dart';
import '../../../shell/presentation/widgets/hisab_header.dart';
import '../widgets/activity_filter.dart';
import '../widgets/activity_filter_chips.dart';
import '../widgets/activity_group.dart';

/// Full transactions feed, grouped by date with working filter chips.
class ActivityPage extends StatefulWidget {
  const ActivityPage({super.key, this.showBack = false});

  final bool showBack;

  @override
  State<ActivityPage> createState() => _ActivityPageState();
}

class _ActivityPageState extends State<ActivityPage> {
  ActivityFilter _filter = ActivityFilter.all;

  @override
  Widget build(BuildContext context) {
    return ResponsiveContent(
      topPadding: 8,
      child: ListView(
        padding: const EdgeInsets.only(bottom: 28),
        children: [
          HisabHeader(title: 'Activity', showBack: widget.showBack),
          const SizedBox(height: AppSpacing.medium),
          ActivityFilterChips(
            filter: _filter,
            onChanged: (filter) => setState(() => _filter = filter),
          ),
          const SizedBox(height: AppSpacing.medium),
          ActivityGroup(dateLabel: 'Today', filter: _filter),
          ActivityGroup(dateLabel: 'Yesterday', filter: _filter),
          ActivityGroup(dateLabel: 'This week', filter: _filter),
        ],
      ),
    );
  }
}

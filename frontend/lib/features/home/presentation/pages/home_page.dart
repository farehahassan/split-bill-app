import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_spacing.dart';
import '../../../../core/ui/entrance.dart';
import '../../../../core/ui/responsive_content.dart';
import '../../../../mock/mock_data.dart';
import '../../../shell/presentation/widgets/hisab_header.dart';
import '../widgets/activity_tile.dart';
import '../widgets/net_balance_card.dart';
import '../widgets/recent_group_card.dart';
import '../widgets/section_header.dart';

/// Home dashboard: net balance card, quick actions, recent groups and
/// recent activity.
class HomePage extends StatelessWidget {
  const HomePage({super.key, this.onOpenGroups, this.onOpenActivity});

  final VoidCallback? onOpenGroups;
  final VoidCallback? onOpenActivity;

  @override
  Widget build(BuildContext context) {
    return ResponsiveContent(
      child: ListView(
        padding: const EdgeInsets.only(bottom: 28),
        children: [
          const HisabHeader(title: 'Assalam-o-Alaikum, Ahmed'),
          const SizedBox(height: AppSpacing.large),

          // Net balance card.
          const Entrance(child: NetBalanceCard()),
          const SizedBox(height: AppSpacing.medium),

          // Quick actions.
          Entrance(
            delay: const Duration(milliseconds: 120),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => context.push('/receipt'),
                    icon: const Icon(Icons.scanner, size: 20),
                    label: const Text('Scan Receipt'),
                  ),
                ),
                const SizedBox(width: AppSpacing.small),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () => context.push('/receipt'),
                    icon: const Icon(Icons.add, size: 20),
                    label: const Text('Add Expense'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.large),

          // Recent groups.
          SectionHeader(
            title: 'Recent Groups',
            actionLabel: 'See all',
            onAction: onOpenGroups,
          ),
          const SizedBox(height: AppSpacing.small),
          for (final group in mockGroups.take(2)) ...[
            Entrance(
              delay: const Duration(milliseconds: 160),
              child: RecentGroupCard(group: group, onTap: onOpenGroups),
            ),
            const SizedBox(height: AppSpacing.small),
          ],
          const SizedBox(height: AppSpacing.medium),

          // Recent activity.
          SectionHeader(
            title: 'Recent Activity',
            actionLabel: 'See all',
            onAction: onOpenActivity,
          ),
          const SizedBox(height: AppSpacing.small),
          for (final activity in mockActivities.take(2)) ...[
            Entrance(
              delay: const Duration(milliseconds: 200),
              child: ActivityTile(activity: activity, onTap: onOpenActivity),
            ),
            const SizedBox(height: AppSpacing.small),
          ],
        ],
      ),
    );
  }
}

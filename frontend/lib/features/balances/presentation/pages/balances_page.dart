import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/entrance.dart';
import '../../../../core/ui/responsive_content.dart';
import '../../../../core/ui/pressable_scale.dart';
import '../../../../core/utils/money.dart';
import '../../../../mock/mock_data.dart';
import '../../../shell/presentation/widgets/hisab_header.dart';
import '../widgets/balance_summary_card.dart';
import '../widgets/friend_entry.dart';
import '../widgets/friend_tile.dart';
import '../widgets/settle_sheet.dart';

/// Balances & settlements: summary cards, friends with outstanding balances
/// and a link to the full transactions feed.
class BalancesPage extends StatefulWidget {
  const BalancesPage({super.key});

  @override
  State<BalancesPage> createState() => _BalancesPageState();
}

class _BalancesPageState extends State<BalancesPage> {
  final List<FriendEntry> _friends = [
    for (final friend in mockFriends) FriendEntry(friend: friend),
  ];

  Money get _youOweTotal => Money(
    _friends
        .where((entry) => !entry.settled && entry.friend.youOwe != null)
        .fold(0, (sum, entry) => sum + entry.friend.youOwe!.minorUnits),
  );

  Money get _youAreOwedTotal => Money(
    _friends
        .where((entry) => !entry.settled && entry.friend.owesYou != null)
        .fold(0, (sum, entry) => sum + entry.friend.owesYou!.minorUnits),
  );

  Future<void> _settle(FriendEntry entry) async {
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      builder: (context) => SettleSheet(entry: entry),
    );
    if (confirmed == true && mounted) {
      setState(() => entry.settled = true);
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              'Settled ${entry.friend.youOwe!.format()} with ${entry.friend.name}',
            ),
          ),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    return ResponsiveContent(
      child: ListView(
        padding: const EdgeInsets.only(bottom: 28),
        children: [
          const HisabHeader(title: 'Hisab'),
          const SizedBox(height: AppSpacing.large),

          const Entrance(
            child: Text('Balances', style: AppTextStyles.sectionTitle),
          ),
          const SizedBox(height: AppSpacing.small),
          Entrance(
            delay: const Duration(milliseconds: 100),
            child: Row(
              children: [
                Expanded(
                  child: BalanceSummaryCard(
                    label: 'YOU OWE',
                    amount: _youOweTotal,
                    color: AppColors.danger,
                  ),
                ),
                const SizedBox(width: AppSpacing.small),
                Expanded(
                  child: BalanceSummaryCard(
                    label: 'YOU ARE OWED',
                    amount: _youAreOwedTotal,
                    color: AppColors.success,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.large),

          Entrance(
            delay: const Duration(milliseconds: 160),
            child: Row(
              children: [
                const Expanded(
                  child: Text('Friends', style: AppTextStyles.sectionTitle),
                ),
                IconButton(
                  onPressed: () => ScaffoldMessenger.of(context)
                    ..hideCurrentSnackBar()
                    ..showSnackBar(
                      const SnackBar(content: Text('Filter coming soon')),
                    ),
                  icon: const Icon(Icons.filter_list, size: 22),
                  color: AppColors.textSecondary,
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.small),
          for (var i = 0; i < _friends.length; i++) ...[
            Entrance(
              delay: Duration(milliseconds: 200 + i * 70),
              child: FriendTile(
                entry: _friends[i],
                onSettle: () => _settle(_friends[i]),
                onTap: _friends[i].friend.owesYou != null
                    ? () => ScaffoldMessenger.of(context)
                        ..hideCurrentSnackBar()
                        ..showSnackBar(
                          SnackBar(
                            content: Text(
                              'Request PKR ${_friends[i].friend.owesYou!.format().replaceAll('PKR ', '')} from ${_friends[i].friend.name}',
                            ),
                          ),
                        )
                    : null,
              ),
            ),
            const SizedBox(height: AppSpacing.small),
          ],
          const SizedBox(height: AppSpacing.medium),

          // Link to the full transactions feed.
          Entrance(
            delay: const Duration(milliseconds: 260),
            child: PressableScale(
              onTap: () => context.push('/transactions'),
              child: Card(
                margin: EdgeInsets.zero,
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.medium),
                  child: Row(
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: AppColors.primarySoft,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: const Icon(
                          Icons.receipt_long,
                          color: AppColors.primary,
                          size: 22,
                        ),
                      ),
                      const SizedBox(width: AppSpacing.medium),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Recent Activity',
                              style: AppTextStyles.bodyMedium,
                            ),
                            SizedBox(height: 2),
                            Text(
                              'View all transactions & settlements',
                              style: AppTextStyles.caption,
                            ),
                          ],
                        ),
                      ),
                      const Icon(
                        Icons.arrow_forward_ios,
                        size: 16,
                        color: AppColors.textSecondary,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

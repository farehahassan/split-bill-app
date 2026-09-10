import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/di/injection.dart';
import '../../../../core/network/api_exception_mapper.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/entrance.dart';
import '../../../../core/ui/responsive_content.dart';
import '../../../../core/utils/money.dart';
import '../../../activity/data/models/activity_event.dart';
import '../../../activity/data/repositories/activity_repository.dart';
import '../../../auth/logic/auth_controller.dart';
import '../../../groups/data/models/group.dart';
import '../../../groups/data/repositories/groups_repository.dart';
import '../../../settlements/data/repositories/settlements_repository.dart';
import '../../../shell/presentation/widgets/hisab_header.dart';
import '../widgets/activity_tile.dart';
import '../widgets/net_balance_card.dart';
import '../widgets/recent_group_card.dart';
import '../widgets/section_header.dart';

/// Home dashboard backed by the live API: greeting with the signed-in user,
/// net balance across groups, recent groups and recent activity.
class HomePage extends StatefulWidget {
  const HomePage({super.key, this.onOpenGroups, this.onOpenActivity});

  final VoidCallback? onOpenGroups;
  final VoidCallback? onOpenActivity;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  List<GroupSummary> _groups = const [];
  var _netMinorUnits = 0;
  var _owesMinorUnits = 0;
  var _owedMinorUnits = 0;
  var _recentEvents = const <ActivityEvent>[];
  String? _error;
  bool _loading = true;

  String _greeting() {
    final user = getIt<AuthController>().user;
    if (user == null) return 'Assalam-o-Alaikum';
    final firstName = user.name.trim().split(RegExp(r'\s+')).first;
    return 'Assalam-o-Alaikum, $firstName';
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final groups = await getIt<GroupsRepository>().getGroups();
      if (!mounted) return;
      setState(() => _groups = groups);
      await _loadBalances(groups);
      await _loadRecentActivity(groups);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = appErrorMessage(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadBalances(List<GroupSummary> groups) async {
    final currentUserId = getIt<AuthController>().user?.id ?? '';
    var net = 0;
    var owes = 0;
    var owed = 0;
    for (final group in groups) {
      try {
        final balances =
            await getIt<SettlementsRepository>().getGroupBalances(group.id);
        final mine = balances
            .where((b) => b.userId == currentUserId)
            .fold<int>(0, (sum, b) => sum + b.amountMinorUnits);
        net += mine;
        if (mine < 0) owes += mine.abs();
        if (mine > 0) owed += mine;
      } catch (_) {
        // A group balance failure should not block the rest of the dashboard.
      }
    }
    if (!mounted) return;
    setState(() {
      _netMinorUnits = net;
      _owesMinorUnits = owes;
      _owedMinorUnits = owed;
    });
  }

  Future<void> _loadRecentActivity(List<GroupSummary> groups) async {
    if (groups.isEmpty) return;
    try {
      final page = await getIt<ActivityRepository>().getGroupActivity(
        groupId: groups.first.id,
        page: 1,
        limit: 2,
      );
      if (!mounted) return;
      setState(() => _recentEvents = page.events);
    } catch (_) {
      // Activity preview is optional.
    }
  }

  @override
  Widget build(BuildContext context) {
    return ResponsiveContent(
      child: ListView(
        padding: const EdgeInsets.only(bottom: 28),
        children: [
          HisabHeader(title: _greeting()),
          const SizedBox(height: AppSpacing.large),

          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 48),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_error != null && _groups.isEmpty) ...[
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Column(
                children: [
                  Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: AppTextStyles.bodyMedium.copyWith(color: AppColors.danger),
                  ),
                  const SizedBox(height: AppSpacing.medium),
                  OutlinedButton(onPressed: _load, child: const Text('Retry')),
                ],
              ),
            ),
          ] else ...[
            // Net balance card.
            Entrance(
              child: NetBalanceCard(
                net: Money(_netMinorUnits),
                owes: Money(_owesMinorUnits),
                owed: Money(_owedMinorUnits),
              ),
            ),
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
                      onPressed: widget.onOpenGroups,
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
              onAction: widget.onOpenGroups,
            ),
            const SizedBox(height: AppSpacing.small),
            if (_groups.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  'No groups yet. Create one on the Hisab tab.',
                  style: AppTextStyles.caption,
                ),
              ),
            for (final group in _groups.take(2)) ...[
              Entrance(
                delay: const Duration(milliseconds: 160),
                child: RecentGroupCard(group: group, onTap: widget.onOpenGroups),
              ),
              const SizedBox(height: AppSpacing.small),
            ],
            const SizedBox(height: AppSpacing.medium),

            // Recent activity.
            SectionHeader(
              title: 'Recent Activity',
              actionLabel: 'See all',
              onAction: widget.onOpenActivity,
            ),
            const SizedBox(height: AppSpacing.small),
            if (_recentEvents.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  _groups.isEmpty
                      ? 'Create a group to start tracking.'
                      : 'No activity yet.',
                  style: AppTextStyles.caption,
                ),
              ),
            for (final event in _recentEvents.take(2)) ...[
              Entrance(
                delay: const Duration(milliseconds: 200),
                child: ActivityTile(event: event, onTap: widget.onOpenActivity),
              ),
              const SizedBox(height: AppSpacing.small),
            ],
          ],
        ],
      ),
    );
  }
}
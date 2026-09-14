import 'package:flutter/material.dart';

import '../../../../app/di/injection.dart';
import '../../../../core/network/api_exception_mapper.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/app_button.dart';
import '../../../../core/ui/entrance.dart';
import '../../../../core/ui/responsive_content.dart';
import '../../../../core/utils/money.dart';
import '../../../auth/logic/auth_controller.dart';
import '../../../settlements/data/repositories/settlements_repository.dart';
import '../../../shell/presentation/widgets/hisab_header.dart';
import '../../data/models/group.dart';
import '../../data/repositories/groups_repository.dart';
import '../widgets/active_group_card.dart';
import '../widgets/create_group_sheet.dart';
import '../widgets/group_details_sheet.dart';

/// Groups management backed by the real group API: list, create, and open a
/// group's details. The per-group balance of the current user is displayed
/// when available.
class GroupsPage extends StatefulWidget {
  const GroupsPage({super.key});

  @override
  State<GroupsPage> createState() => _GroupsPageState();
}

class _GroupsPageState extends State<GroupsPage> {
  List<GroupSummary> _groups = const [];
  Map<String, Money?> _balances = const {};
  String? _error;
  bool _loading = true;

  String get _currentUserId => getIt<AuthController>().user?.id ?? '';

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
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = appErrorMessage(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadBalances(List<GroupSummary> groups) async {
    final balances = <String, Money?>{};
    for (final group in groups) {
      try {
        final groupBalances =
            await getIt<SettlementsRepository>().getGroupBalances(group.id);
        final mine = groupBalances
            .where((b) => b.userId == _currentUserId)
            .fold<int>(0, (sum, b) => sum + b.amountMinorUnits);
        balances[group.id] = Money(mine);
      } catch (_) {
        // A balance failure should not block the group list.
        balances[group.id] = null;
      }
    }
    if (mounted) setState(() => _balances = balances);
  }

  Future<void> _openCreateSheet() async {
    final nameController = TextEditingController();
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => CreateGroupSheet(controller: nameController),
    );
    if (created == true && mounted) {
      final name = nameController.text.trim();
      nameController.dispose();
      try {
        await getIt<GroupsRepository>().createGroup(name.isEmpty ? 'New Group' : name);
        if (!mounted) return;
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(const SnackBar(content: Text('Group created')));
        _load();
      } catch (error) {
        if (!mounted) return;
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(appErrorMessage(error))));
      }
    } else {
      nameController.dispose();
    }
  }

  void _openGroupDetails(GroupSummary group) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => GroupDetailsSheet(groupId: group.id, groupName: group.name),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ResponsiveContent(
      child: ListView(
        padding: const EdgeInsets.only(bottom: 28),
        children: [
          const HisabHeader(title: 'Hisab'),
          const SizedBox(height: AppSpacing.large),

          Entrance(
            child: AppButton(
              label: 'Create Group',
              icon: Icons.add,
              onPressed: _loading ? null : _openCreateSheet,
            ),
          ),
          const SizedBox(height: AppSpacing.large),

          const Entrance(
            delay: Duration(milliseconds: 100),
            child: Text('Active Groups', style: AppTextStyles.sectionTitle),
          ),
          const SizedBox(height: AppSpacing.small),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_error != null) ...[
            Text(
              _error!,
              textAlign: TextAlign.center,
              style: AppTextStyles.bodyMedium.copyWith(color: AppColors.danger),
            ),
            const SizedBox(height: AppSpacing.medium),
            AppButton(label: 'Retry', onPressed: _load),
          ] else if (_groups.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Column(
                children: [
                  const Icon(Icons.group_outlined, size: 40, color: AppColors.textSecondary),
                  const SizedBox(height: AppSpacing.small),
                  Text(
                    'No groups yet. Create one to start splitting.',
                    textAlign: TextAlign.center,
                    style: AppTextStyles.caption,
                  ),
                ],
              ),
            )
          else
            for (var i = 0; i < _groups.length; i++) ...[
              Entrance(
                delay: Duration(milliseconds: 140 + i * 60),
                child: ActiveGroupCard(
                  group: _groups[i],
                  balance: _balances[_groups[i].id],
                  onTap: () => _openGroupDetails(_groups[i]),
                ),
              ),
              const SizedBox(height: AppSpacing.small),
            ],
        ],
      ),
    );
  }
}
import 'package:flutter/material.dart';

import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/entrance.dart';
import '../../../../core/ui/responsive_content.dart';
import '../../../../core/utils/money.dart';
import '../../../../mock/mock_data.dart';
import '../../../shell/presentation/widgets/hisab_header.dart';
import '../widgets/active_group_card.dart';
import '../widgets/create_group_sheet.dart';
import '../widgets/group_details_sheet.dart';
import '../widgets/join_group_sheet.dart';

/// Groups management: create/join actions and the active groups list.
class GroupsPage extends StatefulWidget {
  const GroupsPage({super.key});

  @override
  State<GroupsPage> createState() => _GroupsPageState();
}

class _GroupsPageState extends State<GroupsPage> {
  final List<MockGroup> _groups = [...mockGroups];

  Future<void> _openCreateSheet() async {
    final nameController = TextEditingController();
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => CreateGroupSheet(controller: nameController),
    );
    if (created == true && mounted) {
      final name = nameController.text.trim();
      setState(() {
        _groups.insert(
          0,
          MockGroup(
            id: 'g_${DateTime.now().millisecondsSinceEpoch}',
            name: name.isEmpty ? 'New Group' : name,
            members: 2,
            icon: Icons.group_outlined,
            totalSpent: Money.zero,
            youOwe: Money.zero,
          ),
        );
      });
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text('"$name" group created')));
    }
    nameController.dispose();
  }

  void _openJoinSheet() {
    showModalBottomSheet<void>(
      context: context,
      builder: (context) => const JoinGroupSheet(),
    );
  }

  void _openGroupDetails(MockGroup group) {
    showModalBottomSheet<void>(
      context: context,
      builder: (context) => GroupDetailsSheet(group: group),
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

          // Actions.
          Entrance(
            child: Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _openCreateSheet,
                    icon: const Icon(Icons.add, size: 20),
                    label: const Text('Create Group'),
                  ),
                ),
                const SizedBox(width: AppSpacing.small),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _openJoinSheet,
                    icon: const Icon(Icons.group_add_outlined, size: 20),
                    label: const Text('Join Group'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.large),

          // Active groups.
          const Entrance(
            delay: Duration(milliseconds: 100),
            child: Text('Active Groups', style: AppTextStyles.sectionTitle),
          ),
          const SizedBox(height: AppSpacing.small),
          for (var i = 0; i < _groups.length; i++) ...[
            Entrance(
              delay: Duration(milliseconds: 140 + i * 60),
              child: ActiveGroupCard(
                group: _groups[i],
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

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/app_button.dart';
import '../../../../mock/mock_data.dart';

/// Bottom sheet showing a group's summary and member list.
class GroupDetailsSheet extends StatelessWidget {
  const GroupDetailsSheet({super.key, required this.group});

  final MockGroup group;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.large,
        0,
        AppSpacing.large,
        AppSpacing.large,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(group.name, style: AppTextStyles.title),
          const SizedBox(height: 4),
          Text(
            '${group.members} members · Total spent ${group.totalSpent.format()}',
            style: AppTextStyles.caption,
          ),
          const SizedBox(height: AppSpacing.medium),
          for (final member in const ['Ahmed', 'Sana', 'Bilal', 'Zara'])
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 18,
                    backgroundColor: AppColors.primarySoft,
                    child: Text(
                      member.substring(0, 1),
                      style: const TextStyle(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w800,
                        fontSize: 14,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.medium),
                  Text(member, style: AppTextStyles.bodyMedium),
                ],
              ),
            ),
          const SizedBox(height: AppSpacing.medium),
          AppButton(label: 'View Expenses', onPressed: () {}),
        ],
      ),
    );
  }
}

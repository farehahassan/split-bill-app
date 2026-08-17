import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/animated_money_text.dart';
import '../../../../core/ui/pressable_scale.dart';
import '../../../../mock/mock_data.dart';

/// Card for a group in the active-groups list, showing whether the user owes
/// or is owed inside the group.
class ActiveGroupCard extends StatelessWidget {
  const ActiveGroupCard({super.key, required this.group, this.onTap});

  final MockGroup group;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final owes = group.youOwe != null;
    final balance = owes ? group.youOwe! : group.youAreOwed!;
    return PressableScale(
      onTap: onTap,
      child: Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.medium),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: owes ? AppColors.dangerSoft : AppColors.successSoft,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  group.icon,
                  color: owes ? AppColors.danger : AppColors.success,
                  size: 24,
                ),
              ),
              const SizedBox(width: AppSpacing.medium),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      group.name,
                      style: AppTextStyles.bodyMedium.copyWith(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${group.members} members',
                      style: AppTextStyles.caption,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.small),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    owes ? 'You owe' : 'You are owed',
                    style: AppTextStyles.caption,
                  ),
                  const SizedBox(height: 2),
                  AnimatedMoneyText(
                    amount: balance,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: owes ? AppColors.danger : AppColors.success,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

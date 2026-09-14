import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/animated_money_text.dart';
import '../../../../core/ui/pressable_scale.dart';
import '../../../../core/utils/money.dart';
import '../../data/models/group.dart';

/// Card for a group in the active-groups list. Shows the member count and,
/// when [balance] is supplied, whether the user owes or is owed inside the
/// group (positive balance = user is a creditor).
class ActiveGroupCard extends StatelessWidget {
  const ActiveGroupCard({super.key, required this.group, this.balance, this.onTap});

  final GroupSummary group;

  /// The signed net balance of the current user within [group]; `null` hides
  /// the balance column entirely.
  final Money? balance;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
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
                  color: AppColors.primarySoft,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(Icons.group_outlined, color: AppColors.primary, size: 24),
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
                      '${group.memberCount} members',
                      style: AppTextStyles.caption,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.small),
              if (balance != null)
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      balance!.minorUnits >= 0 ? 'You are owed' : 'You owe',
                      style: AppTextStyles.caption,
                    ),
                    const SizedBox(height: 2),
                    AnimatedMoneyText(
                      amount: balance!.isNegative ? -balance! : balance!,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: balance!.minorUnits >= 0 ? AppColors.success : AppColors.danger,
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
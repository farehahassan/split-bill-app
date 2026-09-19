import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/animated_money_text.dart';
import '../../../../core/ui/pressable_scale.dart';
import '../../../../core/utils/money.dart';
import '../../../settlements/data/models/balance.dart';

/// A member row in the group balances list.
///
/// Members with a positive balance are creditors (the current user settles
/// them); members with a negative balance owe the current user.
class BalanceTile extends StatelessWidget {
  const BalanceTile({super.key, required this.balance, this.onSettle});

  final GroupBalance balance;

  /// Provided when the current user can settle this member.
  final VoidCallback? onSettle;

  @override
  Widget build(BuildContext context) {
    final creditor = balance.isCreditor;
    final amount = Money(balance.amountMinorUnits.abs());
    return PressableScale(
      onTap: onSettle,
      child: Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.medium),
          child: Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: creditor ? AppColors.successSoft : AppColors.dangerSoft,
                child: Text(
                  _initialOf(balance.name),
                  style: TextStyle(
                    color: creditor ? AppColors.success : AppColors.danger,
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.medium),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(balance.name, style: AppTextStyles.bodyMedium),
                    const SizedBox(height: 2),
                    Text(
                      creditor ? 'Is owed by you' : 'Owes you',
                      style: AppTextStyles.caption,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.small),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  AnimatedMoneyText(
                    amount: amount,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: creditor ? AppColors.danger : AppColors.success,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    creditor ? 'Tap to settle' : '',
                    style: AppTextStyles.caption.apply(fontSizeFactor: 0.9),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _initialOf(String name) {
    final trimmed = name.trim();
    return trimmed.isEmpty ? '?' : trimmed.substring(0, 1).toUpperCase();
  }
}
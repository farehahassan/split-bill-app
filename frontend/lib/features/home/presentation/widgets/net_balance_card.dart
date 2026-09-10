import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/animated_money_text.dart';
import '../../../../core/ui/pressable_scale.dart';
import '../../../../core/utils/money.dart';

/// Net balance summary card: overall balance plus what the user owes and is
/// owed (aggregated across known groups), with animated counters.
class NetBalanceCard extends StatelessWidget {
  const NetBalanceCard({
    super.key,
    required this.net,
    required this.owes,
    required this.owed,
    this.onTap,
  });

  final Money net;
  final Money owes;
  final Money owed;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      onTap: onTap,
      child: Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.large),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('NET BALANCE', style: AppTextStyles.labelSmall),
              const SizedBox(height: AppSpacing.small),
              AnimatedMoneyText(
                amount: net,
                style: AppTextStyles.amountLarge.copyWith(
                  color: net.isNegative ? AppColors.danger : AppColors.success,
                  fontSize: 32,
                ),
              ),
              const SizedBox(height: AppSpacing.medium),
              const Divider(),
              const SizedBox(height: AppSpacing.medium),
              Row(
                children: [
                  Expanded(
                    child: _BalanceColumn(
                      label: "You Owe",
                      amount: owes,
                      color: AppColors.danger,
                    ),
                  ),
                  Container(width: 1, height: 40, color: AppColors.border),
                  Expanded(
                    child: _BalanceColumn(
                      label: "You're Owed",
                      amount: owed,
                      color: AppColors.success,
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

class _BalanceColumn extends StatelessWidget {
  const _BalanceColumn({
    required this.label,
    required this.amount,
    required this.color,
  });

  final String label;
  final Money amount;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(label, style: AppTextStyles.caption),
        const SizedBox(height: 4),
        AnimatedMoneyText(
          amount: amount,
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w800,
            color: color,
          ),
        ),
      ],
    );
  }
}
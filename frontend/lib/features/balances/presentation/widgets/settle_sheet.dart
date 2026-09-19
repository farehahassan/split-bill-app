import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/animated_money_text.dart';
import '../../../../core/ui/app_button.dart';
import '../../../../core/utils/money.dart';

/// Bottom sheet confirming a settlement to a payee. Pops with `true` when the
/// user confirms for the displayed amount.
class SettleSheet extends StatelessWidget {
  const SettleSheet({super.key, required this.payeeName, required this.amount});

  final String payeeName;
  final Money amount;

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
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Settle with $payeeName', style: AppTextStyles.title),
          const SizedBox(height: 4),
          Text(
            'You owe ${amount.format()}',
            style: const TextStyle(
              color: AppColors.danger,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: AppSpacing.large),
          AnimatedMoneyText(
            amount: amount,
            style: AppTextStyles.amountLarge.copyWith(color: AppColors.danger),
          ),
          const SizedBox(height: AppSpacing.large),
          AppButton(
            label: 'Settle Now',
            onPressed: () => Navigator.of(context).pop(true),
          ),
        ],
      ),
    );
  }
}
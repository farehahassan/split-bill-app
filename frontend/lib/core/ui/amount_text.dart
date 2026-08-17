import 'package:flutter/material.dart';

import '../utils/money.dart';
import '../theme/app_colors.dart';
import '../theme/app_text_styles.dart';

/// Displays a [Money] amount with the correct typography and color.
/// Negative amounts are shown in the danger color so status is not conveyed
/// by color alone.
class AmountText extends StatelessWidget {
  const AmountText({
    super.key,
    required this.amount,
    this.large = false,
    this.color,
  });

  final Money amount;
  final bool large;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final effectiveColor =
        color ?? (amount.isNegative ? AppColors.danger : AppColors.textPrimary);
    return Text(
      amount.format(),
      style: (large ? AppTextStyles.amountLarge : AppTextStyles.amount)
          .copyWith(color: effectiveColor),
    );
  }
}

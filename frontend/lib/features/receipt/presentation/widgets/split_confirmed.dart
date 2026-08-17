import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';

/// Green success state shown after confirming a receipt split.
class SplitConfirmed extends StatelessWidget {
  const SplitConfirmed({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const ValueKey('confirmed'),
      height: 52,
      decoration: BoxDecoration(
        color: AppColors.success,
        borderRadius: BorderRadius.circular(14),
      ),
      child: const Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.check_circle, color: Colors.white, size: 22),
          SizedBox(width: AppSpacing.small),
          Text(
            'Split Confirmed',
            style: TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

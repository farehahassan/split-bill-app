import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../mock/mock_data.dart';

/// Bottom sheet with details of a single activity.
class ActivityDetailsSheet extends StatelessWidget {
  const ActivityDetailsSheet({super.key, required this.activity});

  final MockActivity activity;

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
          Text(activity.title, style: AppTextStyles.title),
          const SizedBox(height: 4),
          Text(activity.subtitle, style: AppTextStyles.caption),
          const SizedBox(height: AppSpacing.large),
          Row(
            children: [
              Text('Amount', style: AppTextStyles.bodyMedium),
              const Spacer(),
              Text(
                activity.isInflow
                    ? '+${activity.amount.format()}'
                    : activity.amount.format(),
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: activity.isInflow
                      ? AppColors.success
                      : AppColors.danger,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

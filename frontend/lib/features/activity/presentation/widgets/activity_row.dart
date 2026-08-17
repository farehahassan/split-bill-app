import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/pressable_scale.dart';
import '../../../../mock/mock_data.dart';
import 'activity_details_sheet.dart';

/// A single activity row: icon, title, subtitle and signed amount. Tap opens
/// a details bottom sheet.
class ActivityRow extends StatelessWidget {
  const ActivityRow({super.key, required this.activity});

  final MockActivity activity;

  @override
  Widget build(BuildContext context) {
    final isSettlement = activity.icon == Icons.swap_horiz;
    final amountText = isSettlement
        ? '${activity.amount.format()} settled'
        : activity.isInflow
        ? '+${activity.amount.format()}'
        : activity.amount.format();
    final amountColor = isSettlement || activity.isInflow
        ? AppColors.success
        : AppColors.danger;

    return PressableScale(
      onTap: () => showModalBottomSheet<void>(
        context: context,
        builder: (context) => ActivityDetailsSheet(activity: activity),
      ),
      child: Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.medium),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: activity.iconBackground,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(activity.icon, color: activity.iconColor, size: 22),
              ),
              const SizedBox(width: AppSpacing.medium),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      activity.title,
                      style: AppTextStyles.bodyMedium.copyWith(fontSize: 14.5),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(activity.subtitle, style: AppTextStyles.caption),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.small),
              Text(
                amountText,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: amountColor,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

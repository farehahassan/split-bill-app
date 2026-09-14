import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../data/models/activity_event.dart';

/// Bottom sheet with details of a single activity event.
class ActivityDetailsSheet extends StatelessWidget {
  const ActivityDetailsSheet({super.key, required this.event});

  final ActivityEvent event;

  @override
  Widget build(BuildContext context) {
    final amount = event.amount;
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
          Text(event.message, style: AppTextStyles.title),
          const SizedBox(height: 4),
          Text(
            '${event.userName} · ${_dateTime(event.occurredAt)}',
            style: AppTextStyles.caption,
          ),
          if (amount != null) ...[
            const SizedBox(height: AppSpacing.large),
            Row(
              children: [
                Text('Amount', style: AppTextStyles.bodyMedium),
                const Spacer(),
                Text(
                  amount.format(),
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: AppColors.danger,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  static String _dateTime(DateTime date) {
    final local = date.toLocal();
    final month = local.month.toString().padLeft(2, '0');
    final day = local.day.toString().padLeft(2, '0');
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');
    return '$day/$month/${local.year} · $hour:$minute';
  }
}
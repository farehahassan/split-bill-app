import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/pressable_scale.dart';
import '../../data/models/activity_event.dart';
import 'activity_details_sheet.dart';

/// A single activity row: icon, message and amount. Tap opens a details
/// bottom sheet.
class ActivityRow extends StatelessWidget {
  const ActivityRow({super.key, required this.event});

  final ActivityEvent event;

  @override
  Widget build(BuildContext context) {
    final icon = event.isSettlement ? Icons.swap_horiz : Icons.receipt_long;
    final iconColor = event.isSettlement ? AppColors.success : AppColors.primary;
    final iconBackground = event.isSettlement ? AppColors.successSoft : AppColors.primarySoft;

    return PressableScale(
      onTap: () => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (context) => ActivityDetailsSheet(event: event),
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
                  color: iconBackground,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: iconColor, size: 22),
              ),
              const SizedBox(width: AppSpacing.medium),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      event.message,
                      style: AppTextStyles.bodyMedium.copyWith(fontSize: 14.5),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${event.userName} · ${_timeLabel(event.occurredAt)}',
                      style: AppTextStyles.caption,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.small),
              if (event.amount != null)
                Text(
                  event.amount!.format(),
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: event.isSettlement ? AppColors.success : AppColors.textPrimary,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  static String _timeLabel(DateTime date) {
    final local = date.toLocal();
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }
}
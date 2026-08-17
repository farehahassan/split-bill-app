import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/pressable_scale.dart';
import 'friend_entry.dart';

/// Row for a friend with an outstanding balance: shows the owed amount and a
/// Settle action (or a settled state / chevron for owed-to-you friends).
class FriendTile extends StatelessWidget {
  const FriendTile({
    super.key,
    required this.entry,
    required this.onSettle,
    this.onTap,
  });

  final FriendEntry entry;
  final VoidCallback onSettle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final friend = entry.friend;
    final owes = friend.youOwe != null;

    return PressableScale(
      onTap: entry.settled ? null : onTap,
      child: Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.medium),
          child: Row(
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: owes
                    ? AppColors.dangerSoft
                    : AppColors.successSoft,
                child: Text(
                  friend.initials,
                  style: TextStyle(
                    color: owes ? AppColors.danger : AppColors.success,
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
                    Text(
                      friend.name,
                      style: AppTextStyles.bodyMedium.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    if (entry.settled)
                      const Text(
                        'Settled',
                        style: TextStyle(
                          color: AppColors.success,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                        ),
                      )
                    else
                      Text(
                        owes
                            ? 'You owe ${friend.youOwe!.format()}'
                            : 'Owes you ${friend.owesYou!.format()}',
                        style: TextStyle(
                          color: owes ? AppColors.danger : AppColors.success,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                  ],
                ),
              ),
              if (entry.settled)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.successSoft,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.check, size: 14, color: AppColors.success),
                      SizedBox(width: 4),
                      Text(
                        'Settled',
                        style: TextStyle(
                          color: AppColors.success,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                )
              else if (owes)
                FilledButton(
                  onPressed: onSettle,
                  style: FilledButton.styleFrom(
                    minimumSize: const Size(72, 38),
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                  ),
                  child: const Text('Settle'),
                )
              else
                const Icon(Icons.chevron_right, color: AppColors.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}

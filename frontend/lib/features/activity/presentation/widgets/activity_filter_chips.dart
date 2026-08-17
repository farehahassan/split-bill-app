import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/ui/pressable_scale.dart';
import 'activity_filter.dart';

/// Horizontally scrollable filter chips for the activity feed.
class ActivityFilterChips extends StatelessWidget {
  const ActivityFilterChips({
    super.key,
    required this.filter,
    required this.onChanged,
  });

  final ActivityFilter filter;
  final ValueChanged<ActivityFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final (value, label) in const [
            (ActivityFilter.all, 'All'),
            (ActivityFilter.paid, 'You paid'),
            (ActivityFilter.received, 'You received'),
            (ActivityFilter.settlements, 'Settlements'),
          ]) ...[
            _Chip(
              label: label,
              selected: filter == value,
              onTap: () => onChanged(value),
            ),
            const SizedBox(width: AppSpacing.small),
          ],
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? AppColors.primary : AppColors.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected ? AppColors.primary : AppColors.border,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: selected ? Colors.white : AppColors.textSecondary,
          ),
        ),
      ),
    );
  }
}

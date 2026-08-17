import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';

/// Mini receipt graphic used as the scanned-receipt thumbnail.
class ReceiptThumbnail extends StatelessWidget {
  const ReceiptThumbnail({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 64,
      height: 72,
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: SizedBox(
            width: 48,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'KOLACHI',
                  style: TextStyle(
                    fontSize: 7,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.6,
                    color: AppColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 6),
                for (final width in const [36.0, 28.0, 40.0, 24.0])
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Container(
                      height: 4,
                      width: width,
                      decoration: BoxDecoration(
                        color: AppColors.textSecondary.withValues(alpha: 0.4),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

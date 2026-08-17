import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// The "Hisab" brand mark: a green rounded square with a split icon and the
/// wordmark below. [light] renders white text for dark backgrounds.
class AppLogo extends StatelessWidget {
  const AppLogo({super.key, this.size = 64, this.light = false});

  final double size;
  final bool light;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [AppColors.primary, AppColors.primaryDark],
            ),
            borderRadius: BorderRadius.circular(size * 0.28),
            boxShadow: light
                ? [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.3),
                      blurRadius: 24,
                      offset: const Offset(0, 10),
                    ),
                  ]
                : [
                    BoxShadow(
                      color: AppColors.primary.withValues(alpha: 0.3),
                      blurRadius: 20,
                      offset: const Offset(0, 8),
                    ),
                  ],
          ),
          child: Icon(Icons.call_split, color: Colors.white, size: size * 0.52),
        ),
        const SizedBox(height: 12),
        Text(
          'Hisab',
          style: TextStyle(
            fontSize: size * 0.42,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.5,
            color: light ? Colors.white : AppColors.primary,
          ),
        ),
      ],
    );
  }
}

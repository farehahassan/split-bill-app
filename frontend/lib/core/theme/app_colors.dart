import 'package:flutter/material.dart';

/// Semantic color tokens for the "Hisab" brand — dark green on white with
/// soft tints for status colors. Widgets reference these instead of raw hex
/// values so the design stays consistent.
abstract final class AppColors {
  // Brand.
  static const Color primary = Color(0xFF0A3D2E);
  static const Color primaryDark = Color(0xFF062A1F);
  static const Color primarySoft = Color(0xFFE6F0EC);
  static const Color textOnPrimary = Colors.white;

  // Status.
  static const Color success = Color(0xFF16A34A);
  static const Color successSoft = Color(0xFFE7F6EC);
  static const Color danger = Color(0xFFDC2626);
  static const Color dangerSoft = Color(0xFFFDECEC);
  static const Color warning = Color(0xFFF59E0B);
  static const Color warningSoft = Color(0xFFFEF3E2);

  // Surfaces.
  static const Color background = Color(0xFFF7F8F7);
  static const Color surface = Colors.white;
  static const Color surfaceMuted = Color(0xFFF2F3F2);
  static const Color border = Color(0xFFE6E9E7);

  // Text.
  static const Color textPrimary = Color(0xFF1A1D1C);
  static const Color textSecondary = Color(0xFF8A8F8C);

  // Misc.
  static const Color googleBlue = Color(0xFF4285F4);
}

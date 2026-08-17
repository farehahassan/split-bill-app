import 'package:flutter/widgets.dart';

/// Responsive helpers based on the Material 3 window size classes.
///
/// The UI is designed at a 390dp baseline (typical phone). On wider screens
/// content is constrained to a centered column ([contentMaxWidth]) and key
/// dimensions are scaled with [size] so tablets/desktop stay balanced.
class Responsive {
  const Responsive._({required this.width, required this.height});

  /// Logical (dp) width of the current screen.
  final double width;

  /// Logical (dp) height of the current screen.
  final double height;

  /// Baseline design width the UI is drawn for.
  static const double designWidth = 390;

  /// Compact (< 600dp): typical phones.
  static const double compactBreakpoint = 600;

  /// Expanded (>= 840dp): tablets, desktop windows.
  static const double expandedBreakpoint = 840;

  /// Maximum width of the centered content column on large screens.
  static const double contentMaxWidth = 560;

  static Responsive of(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return Responsive._(width: size.width, height: size.height);
  }

  /// Phone-sized layout.
  bool get isCompact => width < compactBreakpoint;

  /// Foldable / small tablet layout.
  bool get isMedium => width >= compactBreakpoint && width < expandedBreakpoint;

  /// Tablet / desktop layout.
  bool get isExpanded => width >= expandedBreakpoint;

  /// Screen-width scale factor relative to the 390dp design baseline,
  /// clamped so very small phones still fit and huge screens stay readable.
  double get scale => (width / designWidth).clamp(0.85, 1.25);

  /// Horizontal page padding, scaled with the screen width.
  double get pagePadding => 16 * scale;

  /// Scales a design-time size (dp) to the current screen width.
  double size(double designSize) => designSize * scale;
}

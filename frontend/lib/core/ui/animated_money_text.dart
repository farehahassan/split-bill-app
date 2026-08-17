import 'package:flutter/material.dart';

import '../utils/money.dart';

/// Renders a [Money] amount with a smooth count-up animation whenever the
/// widget appears or the amount changes.
class AnimatedMoneyText extends StatelessWidget {
  const AnimatedMoneyText({
    super.key,
    required this.amount,
    this.style,
    this.duration = const Duration(milliseconds: 900),
    this.curve = Curves.easeOutCubic,
  });

  final Money amount;
  final TextStyle? style;
  final Duration duration;
  final Curve curve;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: amount.minorUnits.toDouble()),
      duration: duration,
      curve: curve,
      builder: (context, value, _) =>
          Text(Money(value.round()).format(), style: style),
    );
  }
}

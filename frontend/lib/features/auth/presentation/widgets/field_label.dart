import 'package:flutter/material.dart';

import '../../../../core/theme/app_text_styles.dart';

/// Uppercase small form field label (e.g. "EMAIL", "PASSWORD").
class FieldLabel extends StatelessWidget {
  const FieldLabel({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(text, style: AppTextStyles.labelSmall);
  }
}

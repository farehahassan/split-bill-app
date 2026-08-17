import 'package:flutter/material.dart';

import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/app_button.dart';
import '../../../../core/ui/app_text_field.dart';

/// Bottom sheet for joining a group with a code.
class JoinGroupSheet extends StatelessWidget {
  const JoinGroupSheet({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.large),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Join Group', style: AppTextStyles.title),
          const SizedBox(height: 4),
          Text(
            'Enter the group code shared by a friend.',
            style: AppTextStyles.caption,
          ),
          const SizedBox(height: AppSpacing.medium),
          AppTextField(
            label: 'Group code',
            hintText: 'e.g. NARAN-5X2',
            textInputAction: TextInputAction.done,
          ),
          const SizedBox(height: AppSpacing.medium),
          AppButton(
            label: 'Join',
            onPressed: () {
              Navigator.of(context).pop();
              ScaffoldMessenger.of(context)
                ..hideCurrentSnackBar()
                ..showSnackBar(const SnackBar(content: Text('Joined group!')));
            },
          ),
        ],
      ),
    );
  }
}

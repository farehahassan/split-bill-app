import 'package:flutter/material.dart';

import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/app_button.dart';
import '../../../../core/ui/app_text_field.dart';

/// Bottom sheet form for creating a group. Pops with `true` on submit.
class CreateGroupSheet extends StatelessWidget {
  const CreateGroupSheet({super.key, required this.controller});

  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: AppSpacing.large,
        right: AppSpacing.large,
        bottom: MediaQuery.of(context).viewInsets.bottom + AppSpacing.large,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Create Group', style: AppTextStyles.title),
          const SizedBox(height: AppSpacing.medium),
          AppTextField(
            controller: controller,
            label: 'Group name',
            hintText: 'e.g. Trip to Naran',
            textInputAction: TextInputAction.done,
          ),
          const SizedBox(height: AppSpacing.medium),
          AppButton(
            label: 'Create',
            onPressed: () => Navigator.of(context).pop(true),
          ),
        ],
      ),
    );
  }
}

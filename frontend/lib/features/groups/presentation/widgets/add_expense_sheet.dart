import 'package:flutter/material.dart';

import '../../../../app/di/injection.dart';
import '../../../../core/network/api_exception_mapper.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/app_button.dart';
import '../../../../core/ui/app_text_field.dart';
import '../../../../core/utils/money.dart';
import '../../../expenses/data/models/expense.dart';
import '../../../expenses/data/repositories/expenses_repository.dart';
import '../../data/models/group.dart';

/// Bottom sheet that records a real expense via `POST /groups/:id/expenses`.
///
/// All group members participate with an equal split (the backend distributes
/// the remainder exactly). Financial mutations are never auto-retried.
class AddExpenseSheet extends StatefulWidget {
  const AddExpenseSheet({
    super.key,
    required this.groupId,
    required this.members,
    required this.currentUserId,
  });

  final String groupId;
  final List<GroupMember> members;
  final String currentUserId;

  @override
  State<AddExpenseSheet> createState() => _AddExpenseSheetState();
}

class _AddExpenseSheetState extends State<AddExpenseSheet> {
  final TextEditingController _descriptionController = TextEditingController();
  final TextEditingController _amountController = TextEditingController();

  String _payerId = '';
  String? _error;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _payerId = widget.currentUserId;
  }

  @override
  void dispose() {
    _descriptionController.dispose();
    _amountController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final description = _descriptionController.text.trim();
    final amountText = _amountController.text.trim();

    if (description.isEmpty) {
      setState(() => _error = 'Enter a description');
      return;
    }
    final Money amount;
    try {
      amount = Money.parse(amountText);
    } on FormatException {
      setState(() => _error = 'Enter a valid amount, e.g. 1,250');
      return;
    }
    if (amount.minorUnits <= 0) {
      setState(() => _error = 'Enter an amount greater than zero');
      return;
    }
    if (_payerId.isEmpty) {
      setState(() => _error = 'Choose who paid');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    final participants = [
      for (final member in widget.members) ExpenseParticipant(userId: member.id),
    ];

    try {
      await getIt<ExpensesRepository>().createExpense(
        widget.groupId,
        CreateExpenseRequest(
          description: description,
          amountMinorUnits: amount.minorUnits,
          payerId: _payerId,
          splitType: 'EQUAL',
          participants: participants,
        ),
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = appErrorMessage(error);
      });
    }
  }

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
          Text('Add Expense', style: AppTextStyles.title),
          const SizedBox(height: 4),
          Text(
            'Split equally among ${widget.members.length} member(s)',
            style: AppTextStyles.caption,
          ),
          const SizedBox(height: AppSpacing.medium),
          AppTextField(
            controller: _descriptionController,
            label: 'Description',
            hintText: 'e.g. Dinner at Cafe',
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: AppSpacing.small),
          AppTextField(
            controller: _amountController,
            label: 'Amount (PKR)',
            hintText: 'e.g. 2,500',
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: AppSpacing.small),
          DropdownButtonFormField<String>(
            key: const ValueKey('add-expense-payer'),
            initialValue: _payerId,
            decoration: const InputDecoration(labelText: 'Paid by'),
            items: [
              for (final member in widget.members)
                DropdownMenuItem(value: member.id, child: Text(member.name)),
            ],
            onChanged: _submitting
                ? null
                : (value) => setState(() => _payerId = value ?? ''),
          ),
          const SizedBox(height: AppSpacing.medium),
          if (_error != null) ...[
            Text(
              _error!,
              style: AppTextStyles.bodyMedium.copyWith(color: AppColors.danger),
            ),
            const SizedBox(height: AppSpacing.small),
          ],
          AppButton(
            label: 'Save Expense',
            isLoading: _submitting,
            onPressed: _save,
          ),
        ],
      ),
    );
  }
}
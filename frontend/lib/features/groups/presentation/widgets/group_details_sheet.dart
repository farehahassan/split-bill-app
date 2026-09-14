import 'package:flutter/material.dart';

import '../../../../app/di/injection.dart';
import '../../../../core/network/api_exception_mapper.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/app_button.dart';
import '../../../../core/ui/app_text_field.dart';
import '../../../../core/utils/money.dart';
import '../../../auth/logic/auth_controller.dart';
import '../../../expenses/data/models/expense.dart';
import '../../../expenses/data/repositories/expenses_repository.dart';
import '../../data/models/group.dart';
import '../../data/repositories/groups_repository.dart';
import 'add_expense_sheet.dart';

/// Bottom sheet for a single group: live members list, recorded expenses and
/// actions to add a member (by user id) or record an expense.
class GroupDetailsSheet extends StatefulWidget {
  const GroupDetailsSheet({super.key, required this.groupId, required this.groupName});

  final String groupId;
  final String groupName;

  @override
  State<GroupDetailsSheet> createState() => _GroupDetailsSheetState();
}

class _GroupDetailsSheetState extends State<GroupDetailsSheet> {
  GroupDetail? _detail;
  List<ExpenseSummary> _expenses = const [];
  String? _error;
  bool _loading = true;

  String get _currentUserId => getIt<AuthController>().user?.id ?? '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        getIt<GroupsRepository>().getGroup(widget.groupId),
        getIt<ExpensesRepository>().getGroupExpenses(widget.groupId),
      ]);
      if (!mounted) return;
      setState(() {
        _detail = results[0] as GroupDetail;
        _expenses = (results[1] as List<ExpenseSummary>);
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = appErrorMessage(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _addMember() async {
    final controller = TextEditingController();
    final userId = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add member'),
        content: AppTextField(
          controller: controller,
          label: 'User ID',
          hintText: 'Paste the user\'s id',
          textInputAction: TextInputAction.done,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('Add'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (userId == null || userId.isEmpty || !mounted) return;

    try {
      await getIt<GroupsRepository>().addMember(widget.groupId, userId);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Member added')));
      _load();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(appErrorMessage(error))));
    }
  }

  Future<void> _openAddExpense() async {
    final detail = _detail;
    if (detail == null) return;
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => AddExpenseSheet(
        groupId: widget.groupId,
        members: detail.members,
        currentUserId: _currentUserId,
      ),
    );
    if (saved == true && mounted) {
      _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.9,
        maxChildSize: 0.95,
        builder: (context, scrollController) {
          return Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.large,
              0,
              AppSpacing.large,
              AppSpacing.large,
            ),
            child: ListView(
              controller: scrollController,
              children: [
                Text(widget.groupName, style: AppTextStyles.title),
                const SizedBox(height: 4),
                Text(_subtitle, style: AppTextStyles.caption),
                const SizedBox(height: AppSpacing.medium),

                if (_loading)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 40),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (_error != null) ...[
                  Text(
                    _error!,
                    style: AppTextStyles.bodyMedium.copyWith(color: AppColors.danger),
                  ),
                  const SizedBox(height: AppSpacing.medium),
                  AppButton(label: 'Retry', onPressed: _load),
                ] else ...[
                  _actions,
                  const SizedBox(height: AppSpacing.medium),
                  _membersSection,
                  const SizedBox(height: AppSpacing.large),
                  _expensesSection,
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  String get _subtitle {
    final detail = _detail;
    if (detail == null) return 'Loading…';
    final totalSpent = _expenses.fold<Money>(
      Money.zero,
      (sum, e) => sum + Money(e.amountMinorUnits),
    );
    return '${detail.members.length} members · Total spent ${totalSpent.format()}';
  }

  Widget get _actions {
    return Row(
      children: [
        Expanded(
          child: FilledButton.icon(
            onPressed: _openAddExpense,
            icon: const Icon(Icons.add, size: 20),
            label: const Text('Add Expense'),
          ),
        ),
        const SizedBox(width: AppSpacing.small),
        Expanded(
          child: OutlinedButton.icon(
            onPressed: _addMember,
            icon: const Icon(Icons.person_add_outlined, size: 20),
            label: const Text('Add Member'),
          ),
        ),
      ],
    );
  }

  Widget get _membersSection {
    final detail = _detail!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Members', style: AppTextStyles.sectionTitle),
        const SizedBox(height: AppSpacing.small),
        for (final member in detail.members)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 18,
                  backgroundColor: AppColors.primarySoft,
                  child: Text(
                    _initialOf(member.name),
                    style: const TextStyle(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.medium),
                Expanded(
                  child: Text(
                    '${member.name}${member.id == _currentUserId ? ' (you)' : ''}',
                    style: AppTextStyles.bodyMedium,
                  ),
                ),
                if (member.id == _detail!.createdById)
                  const Text('· Owner', style: TextStyle(fontSize: 12)),
              ],
            ),
          ),
      ],
    );
  }

  Widget get _expensesSection {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Expenses', style: AppTextStyles.sectionTitle),
        const SizedBox(height: AppSpacing.small),
        if (_expenses.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text('No expenses yet.', style: AppTextStyles.caption),
          ),
        for (final expense in _expenses)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.primarySoft,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.receipt_long, color: AppColors.primary, size: 20),
                ),
                const SizedBox(width: AppSpacing.medium),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(expense.description, style: AppTextStyles.bodyMedium),
                      const SizedBox(height: 2),
                      Text(
                        '${expense.payer.name} · ${_expenseDate(expense.expenseDate)}',
                        style: AppTextStyles.caption,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.small),
                Text(
                  Money(expense.amountMinorUnits).format(),
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
                ),
              ],
            ),
          ),
      ],
    );
  }

  static String _initialOf(String name) {
    final trimmed = name.trim();
    return trimmed.isEmpty ? '?' : trimmed.substring(0, 1).toUpperCase();
  }

  static String _expenseDate(DateTime date) {
    final local = date.toLocal();
    final month = local.month.toString().padLeft(2, '0');
    final day = local.day.toString().padLeft(2, '0');
    return '$day/$month/${local.year}';
  }
}
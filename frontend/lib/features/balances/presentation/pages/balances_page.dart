import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/di/injection.dart';
import '../../../../core/errors/app_failure.dart';
import '../../../../core/network/api_exception_mapper.dart';
import '../../../../core/network/idempotency_key.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/entrance.dart';
import '../../../../core/ui/pressable_scale.dart';
import '../../../../core/ui/responsive_content.dart';
import '../../../../core/utils/money.dart';
import '../../../auth/logic/auth_controller.dart';
import '../../../groups/data/models/group.dart';
import '../../../groups/data/repositories/groups_repository.dart';
import '../../../shell/presentation/widgets/hisab_header.dart';
import '../../../settlements/data/models/balance.dart';
import '../../../settlements/data/models/settlement.dart';
import '../../../settlements/data/repositories/settlements_repository.dart';
import '../widgets/balance_summary_card.dart';
import '../widgets/balance_tile.dart';
import '../widgets/settle_sheet.dart';

/// Balances & settlements for one group, loaded from the live API
/// (`GET /groups/:id/balances` and `GET /groups/:id/settlements`).
///
/// Settling creates a real settlement (`POST /groups/:id/settlements`) using
/// an idempotency key so retrying a failed attempt can never double-charge.
/// Mutations are never auto-retried.
class BalancesPage extends StatefulWidget {
  const BalancesPage({super.key});

  @override
  State<BalancesPage> createState() => _BalancesPageState();
}

class _BalancesPageState extends State<BalancesPage> {
  List<GroupSummary> _groups = const [];
  String? _selectedGroupId;
  List<GroupBalance> _balances = const [];
  List<Settlement> _settlements = const [];
  String? _error;
  bool _loading = true;

  String get _currentUserId => getIt<AuthController>().user?.id ?? '';

  GroupSummary? get _selectedGroup {
    for (final group in _groups) {
      if (group.id == _selectedGroupId) return group;
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    _loadGroups();
  }

  Future<void> _loadGroups() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final groups = await getIt<GroupsRepository>().getGroups();
      if (!mounted) return;
      setState(() {
        _groups = groups;
        if (_selectedGroupId == null && groups.isNotEmpty) {
          _selectedGroupId = groups.first.id;
        }
      });
      await _loadGroupData();
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = appErrorMessage(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadGroupData() async {
    final groupId = _selectedGroupId;
    if (groupId == null) return;
    try {
      final results = await Future.wait([
        getIt<SettlementsRepository>().getGroupBalances(groupId),
        getIt<SettlementsRepository>().getGroupSettlements(groupId),
      ]);
      if (!mounted) return;
      setState(() {
        _balances = results[0] as List<GroupBalance>;
        _settlements = results[1] as List<Settlement>;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = appErrorMessage(error));
    }
  }

  void _selectGroup(String? groupId) {
    if (groupId == null || groupId == _selectedGroupId) return;
    setState(() {
      _selectedGroupId = groupId;
      _balances = const [];
      _settlements = const [];
    });
    _loadGroupData();
  }

  Money get _youOweTotal => Money(
    _balances
        .where((b) => b.userId == _currentUserId && b.isDebtor)
        .fold<int>(0, (sum, b) => sum + b.amountMinorUnits),
  );

  Money get _youAreOwedTotal => Money(
    _balances
        .where((b) => b.userId == _currentUserId && b.isCreditor)
        .fold<int>(0, (sum, b) => sum + b.amountMinorUnits),
  );

  List<GroupBalance> get _memberBalances {
    final others = _balances.where((b) => b.userId != _currentUserId).toList()
      ..sort((a, b) => a.amountMinorUnits.compareTo(b.amountMinorUnits));
    return others;
  }

  Future<void> _settle(GroupBalance payee) async {
    final amount = Money(payee.amountMinorUnits.abs());
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => SettleSheet(payeeName: payee.name, amount: amount),
    );
    if (confirmed != true || !mounted) return;

    _createSettlement(payee, amount);
  }

  /// Creates the settlement, reusing [request]'s idempotency key when a
  /// transport-level failure lets the user retry the same logical operation.
  Future<void> _createSettlement(
    GroupBalance payee,
    Money amount, {
    String? reusedKey,
  }) async {
    final request = CreateSettlementRequest(
      payerId: _currentUserId,
      payeeId: payee.userId,
      amountMinorUnits: amount.minorUnits,
      idempotencyKey: reusedKey ?? generateIdempotencyKey(),
    );

    final String groupId = _selectedGroupId!;
    try {
      // Single attempt: the network layer never auto-retries.
      await getIt<SettlementsRepository>().createSettlement(groupId, request);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(content: Text('Settled ${amount.format()} with ${payee.name}')),
        );
      _loadGroupData();
    } catch (error) {
      if (!mounted) return;

      // Transport/availability failures are safe to retry with the same key.
      final failure = error is AppFailure ? error : null;
      if (failure is NetworkFailure || failure is ServiceUnavailableFailure) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(
            SnackBar(
              content: const Text('Settlement failed. Please retry.'),
              action: SnackBarAction(
                label: 'Retry',
                onPressed: () => _createSettlement(payee, amount, reusedKey: request.idempotencyKey),
              ),
            ),
          );
      } else {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(appErrorMessage(error))));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selectedGroup;
    return ResponsiveContent(
      child: ListView(
        padding: const EdgeInsets.only(bottom: 28),
        children: [
          const HisabHeader(title: 'Hisab'),
          const SizedBox(height: AppSpacing.large),

          Entrance(
            child: Text('Balances', style: AppTextStyles.sectionTitle),
          ),
          const SizedBox(height: AppSpacing.small),
          if (_groups.isNotEmpty) _groupSelector,
          const SizedBox(height: AppSpacing.medium),

          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_error != null && selected == null) _errorView
          else if (selected == null) _emptyView
          else ...[
            Entrance(
              delay: const Duration(milliseconds: 60),
              child: Row(
                children: [
                  Expanded(
                    child: BalanceSummaryCard(
                      label: 'YOU OWE',
                      amount: _youOweTotal.isNegative ? -_youOweTotal : _youOweTotal,
                      color: AppColors.danger,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.small),
                  Expanded(
                    child: BalanceSummaryCard(
                      label: 'YOU ARE OWED',
                      amount: _youAreOwedTotal,
                      color: AppColors.success,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.large),

            Entrance(
              delay: const Duration(milliseconds: 120),
              child: Text('Members', style: AppTextStyles.sectionTitle),
            ),
            const SizedBox(height: AppSpacing.small),
            if (_memberBalances.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Text('No outstanding balances.', style: AppTextStyles.caption),
              ),
            for (var i = 0; i < _memberBalances.length; i++) ...[
              Entrance(
                delay: Duration(milliseconds: 160 + i * 60),
                child: BalanceTile(
                  balance: _memberBalances[i],
                  onSettle: _memberBalances[i].isCreditor ? () => _settle(_memberBalances[i]) : null,
                ),
              ),
              const SizedBox(height: AppSpacing.small),
            ],
            const SizedBox(height: AppSpacing.medium),

            if (_settlements.isNotEmpty) ...[
              Entrance(
                delay: const Duration(milliseconds: 160),
                child: Text('Recent Settlements', style: AppTextStyles.sectionTitle),
              ),
              const SizedBox(height: AppSpacing.small),
              for (var i = 0; i < _settlements.length && i < 3; i++) ...[
                Entrance(
                  delay: Duration(milliseconds: 200 + i * 60),
                  child: _SettlementRow(settlement: _settlements[i]),
                ),
                const SizedBox(height: AppSpacing.small),
              ],
              const SizedBox(height: AppSpacing.medium),
            ],

            // Link to the full transactions feed.
            Entrance(
              delay: const Duration(milliseconds: 260),
              child: PressableScale(
                onTap: () => context.push('/transactions'),
                child: Card(
                  margin: EdgeInsets.zero,
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.medium),
                    child: Row(
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: AppColors.primarySoft,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: const Icon(
                            Icons.receipt_long,
                            color: AppColors.primary,
                            size: 22,
                          ),
                        ),
                        const SizedBox(width: AppSpacing.medium),
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Recent Activity',
                                style: AppTextStyles.bodyMedium,
                              ),
                              SizedBox(height: 2),
                              Text(
                                'View all transactions & settlements',
                                style: AppTextStyles.caption,
                              ),
                            ],
                          ),
                        ),
                        const Icon(
                          Icons.arrow_forward_ios,
                          size: 16,
                          color: AppColors.textSecondary,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget get _groupSelector {
    return SizedBox(
      height: 38,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _groups.length,
        separatorBuilder: (_, __) => const SizedBox(width: AppSpacing.small),
        itemBuilder: (context, index) {
          final group = _groups[index];
          final selected = group.id == _selectedGroupId;
          return ChoiceChip(
            label: Text(group.name),
            selected: selected,
            onSelected: (_) => _selectGroup(group.id),
          );
        },
      ),
    );
  }

  Widget get _errorView {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 24),
      child: Column(
        children: [
          Text(
            _error!,
            textAlign: TextAlign.center,
            style: AppTextStyles.bodyMedium.copyWith(color: AppColors.danger),
          ),
          const SizedBox(height: AppSpacing.medium),
          OutlinedButton(onPressed: _loadGroups, child: const Text('Retry')),
        ],
      ),
    );
  }

  Widget get _emptyView {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 32),
      child: Column(
        children: [
          const Icon(Icons.account_balance_wallet_outlined, size: 40, color: AppColors.textSecondary),
          const SizedBox(height: AppSpacing.small),
          Text(
            'Create a group to see balances.',
            textAlign: TextAlign.center,
            style: AppTextStyles.caption,
          ),
        ],
      ),
    );
  }
}

class _SettlementRow extends StatelessWidget {
  const _SettlementRow({required this.settlement});

  final Settlement settlement;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.medium),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: AppColors.successSoft,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.swap_horiz, color: AppColors.success, size: 20),
            ),
            const SizedBox(width: AppSpacing.medium),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${settlement.payer.name} paid ${settlement.payee.name}',
                    style: AppTextStyles.bodyMedium,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _dateLabel(settlement.createdAt),
                    style: AppTextStyles.caption,
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.small),
            Text(
              settlement.amount.format(),
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w800,
                color: AppColors.danger,
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _dateLabel(DateTime date) {
    final local = date.toLocal();
    final now = DateTime.now();
    if (local.toLocal().day == now.day &&
        local.month == now.month &&
        local.year == now.year) {
      return 'Today';
    }
    final month = local.month.toString().padLeft(2, '0');
    final day = local.day.toString().padLeft(2, '0');
    return '$day/$month/${local.year}';
  }
}
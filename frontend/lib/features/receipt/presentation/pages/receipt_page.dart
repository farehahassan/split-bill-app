import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/animated_money_text.dart';
import '../../../../core/ui/entrance.dart';
import '../../../../core/ui/responsive_content.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/utils/responsive.dart';
import '../../../../mock/mock_data.dart';
import '../../../shell/presentation/widgets/hisab_header.dart';
import '../widgets/item_row.dart';
import '../widgets/person_chip.dart';
import '../widgets/receipt_thumbnail.dart';
import '../widgets/split_all_button.dart';
import '../widgets/split_confirmed.dart';

/// Scanned receipt screen: total bill, item-to-person assignment (tap to
/// assign), split-all and confirm. Driven entirely by mock data.
class ReceiptPage extends StatefulWidget {
  const ReceiptPage({super.key});

  @override
  State<ReceiptPage> createState() => _ReceiptPageState();
}

class _ReceiptPageState extends State<ReceiptPage> {
  String _selected = 'You';
  final List<ReceiptItem> _items = receiptItems
      .map((item) => item.copyWith())
      .toList();
  bool _splitAll = false;
  bool _confirming = false;
  bool _confirmed = false;

  Money _personTotal(String name) {
    if (_splitAll) {
      final shares = splitEqually(
        const Money(receiptTotalMinorUnits),
        receiptPeople.length,
      );
      return shares[receiptPeople.indexWhere((p) => p.name == name)];
    }
    var sum = 0;
    for (final item in _items) {
      if (item.assignedTo == name) sum += item.total;
    }
    return Money(sum);
  }

  int get _unassignedCount =>
      _items.where((item) => item.assignedTo == null).length;

  void _toggleItem(ReceiptItem item) {
    if (_splitAll) return;
    setState(() {
      final index = _items.indexWhere((i) => i.id == item.id);
      final current = _items[index];
      _items[index] = current.copyWith(
        assignedTo: current.assignedTo == _selected ? null : _selected,
      );
    });
  }

  void _onSplitAll() {
    setState(() => _splitAll = true);
  }

  Future<void> _confirm() async {
    if (_confirming) return;
    setState(() => _confirming = true);
    await Future<void>.delayed(const Duration(milliseconds: 1000));
    if (!mounted) return;
    setState(() {
      _confirming = false;
      _confirmed = true;
    });
    await Future<void>.delayed(const Duration(milliseconds: 900));
    if (!mounted) return;
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: ResponsiveContent(
        topPadding: 8,
        child: ListView(
          padding: const EdgeInsets.only(bottom: 24),
          children: [
            const HisabHeader(title: 'Hisab', showBack: true),
            const SizedBox(height: AppSpacing.medium),

            // Receipt header card.
            Entrance(
              child: Card(
                margin: EdgeInsets.zero,
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.medium),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Kolachi Do Darya',
                              style: AppTextStyles.title,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Scanned today at 9:42 PM',
                              style: AppTextStyles.caption,
                            ),
                          ],
                        ),
                      ),
                      const ReceiptThumbnail(),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.medium),

            // Total bill bar.
            Entrance(
              delay: const Duration(milliseconds: 100),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    const Text('TOTAL BILL', style: AppTextStyles.labelSmall),
                    const Spacer(),
                    AnimatedMoneyText(
                      amount: const Money(receiptTotalMinorUnits),
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        color: AppColors.primary,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const Divider(),
            const SizedBox(height: AppSpacing.small),

            // Assign items.
            Entrance(
              delay: const Duration(milliseconds: 160),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Assign Items',
                      style: AppTextStyles.sectionTitle,
                    ),
                  ),
                  Text(
                    'Tap to select',
                    style: AppTextStyles.caption.copyWith(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.medium),

            // People row.
            Entrance(
              delay: const Duration(milliseconds: 200),
              child: SizedBox(
                height: Responsive.of(context).size(108),
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    for (final person in receiptPeople)
                      PersonChip(
                        person: person,
                        amount: _personTotal(person.name),
                        selected: _selected == person.name,
                        onTap: () => setState(() => _selected = person.name),
                      ),
                    SplitAllButton(onTap: _onSplitAll),
                  ],
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.medium),

            // Itemized list.
            for (var i = 0; i < _items.length; i++) ...[
              Entrance(
                delay: Duration(milliseconds: 220 + i * 40),
                child: ItemRow(
                  item: _items[i],
                  selectedPerson: _selected,
                  onTap: () => _toggleItem(_items[i]),
                ),
              ),
              const SizedBox(height: AppSpacing.small),
            ],
            const SizedBox(height: AppSpacing.medium),

            // Footer actions.
            Entrance(
              delay: const Duration(milliseconds: 300),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (!_confirmed && !_splitAll && _unassignedCount > 0)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.small),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(
                            Icons.info_outline,
                            size: 15,
                            color: AppColors.warning,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            '$_unassignedCount item'
                            '${_unassignedCount == 1 ? '' : 's'} unassigned',
                            style: const TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700,
                              color: AppColors.warning,
                            ),
                          ),
                        ],
                      ),
                    ),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 300),
                    switchInCurve: Curves.easeOutBack,
                    child: _confirmed
                        ? const SplitConfirmed()
                        : Row(
                            key: const ValueKey('actions'),
                            children: [
                              Expanded(
                                child: OutlinedButton(
                                  onPressed: _confirming
                                      ? null
                                      : () => ScaffoldMessenger.of(context)
                                          ..hideCurrentSnackBar()
                                          ..showSnackBar(
                                            const SnackBar(
                                              content: Text(
                                                'Receipt editor coming soon',
                                              ),
                                            ),
                                          ),
                                  child: const Text('Edit Receipt'),
                                ),
                              ),
                              const SizedBox(width: AppSpacing.small),
                              Expanded(
                                child: FilledButton(
                                  onPressed: _confirming ? null : _confirm,
                                  child: _confirming
                                      ? const SizedBox(
                                          width: 22,
                                          height: 22,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2.5,
                                            color: Colors.white,
                                          ),
                                        )
                                      : const Text('Confirm Split'),
                                ),
                              ),
                            ],
                          ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

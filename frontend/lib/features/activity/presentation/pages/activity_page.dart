import 'package:flutter/material.dart';

import '../../../../app/di/injection.dart';
import '../../../../core/network/api_exception_mapper.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/app_button.dart';
import '../../../../core/ui/responsive_content.dart';
import '../../../groups/data/models/group.dart';
import '../../../groups/data/repositories/groups_repository.dart';
import '../../../shell/presentation/widgets/hisab_header.dart';
import '../../data/models/activity_event.dart';
import '../../data/repositories/activity_repository.dart';
import '../widgets/activity_filter.dart';
import '../widgets/activity_filter_chips.dart';
import '../widgets/activity_group.dart';

/// Full activity feed for a group, loaded from
/// `GET /groups/:id/activity` with page/limit pagination.
class ActivityPage extends StatefulWidget {
  const ActivityPage({super.key, this.showBack = false});

  final bool showBack;

  @override
  State<ActivityPage> createState() => _ActivityPageState();
}

class _ActivityPageState extends State<ActivityPage> {
  static const int _pageSize = 20;

  List<GroupSummary> _groups = const [];
  String? _selectedGroupId;
  List<ActivityEvent> _events = const [];
  ActivityPagination? _pagination;
  ActivityFilter _filter = ActivityFilter.all;
  bool _loadingInitial = true;
  bool _loadingMore = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadGroups();
  }

  Future<void> _loadGroups() async {
    setState(() {
      _loadingInitial = true;
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
      await _refresh();
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = appErrorMessage(error));
    } finally {
      if (mounted) setState(() => _loadingInitial = false);
    }
  }

  Future<void> _refresh() async {
    final groupId = _selectedGroupId;
    if (groupId == null) return;
    try {
      final page = await getIt<ActivityRepository>().getGroupActivity(
        groupId: groupId,
        page: 1,
        limit: _pageSize,
      );
      if (!mounted) return;
      setState(() {
        _events = page.events;
        _pagination = page.pagination;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = appErrorMessage(error));
    }
  }

  Future<void> _loadMore() async {
    final groupId = _selectedGroupId;
    final pagination = _pagination;
    if (groupId == null ||
        pagination == null ||
        !pagination.hasMore ||
        _loadingMore) {
      return;
    }
    setState(() => _loadingMore = true);
    try {
      final next = await getIt<ActivityRepository>().getGroupActivity(
        groupId: groupId,
        page: pagination.page + 1,
        limit: _pageSize,
      );
      if (!mounted) return;
      setState(() {
        _events = [..._events, ...next.events];
        _pagination = next.pagination;
      });
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(appErrorMessage(error))));
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  void _selectGroup(String? groupId) {
    if (groupId == null || groupId == _selectedGroupId) return;
    setState(() {
      _selectedGroupId = groupId;
      _events = const [];
      _pagination = null;
    });
    _refresh();
  }

  /// Groups events into [ActivityGroup] sections by calendar day.
  List<_ActivityDaySection> get _sections {
    final sections = <String, List<ActivityEvent>>{};
    for (final event in _events) {
      final day = _dayKey(event.occurredAt);
      sections.putIfAbsent(day, () => []).add(event);
    }
    final ordered = sections.entries.toList()
      ..sort((a, b) => b.key.compareTo(a.key));
    return [
      for (final entry in ordered)
        _ActivityDaySection(label: _dayLabel(entry.key), events: entry.value),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return ResponsiveContent(
      topPadding: 8,
      child: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.only(bottom: 28),
          children: [
            HisabHeader(title: 'Activity', showBack: widget.showBack),
            const SizedBox(height: AppSpacing.medium),
            if (_groups.isNotEmpty) _groupSelector,
            const SizedBox(height: AppSpacing.small),
            ActivityFilterChips(
              filter: _filter,
              onChanged: (filter) => setState(() => _filter = filter),
            ),
            const SizedBox(height: AppSpacing.medium),

            if (_loadingInitial)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 48),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null) ...[
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Column(
                  children: [
                    Text(
                      _error!,
                      textAlign: TextAlign.center,
                      style: AppTextStyles.bodyMedium.copyWith(color: AppColors.danger),
                    ),
                    const SizedBox(height: AppSpacing.medium),
                    OutlinedButton(onPressed: _refresh, child: const Text('Retry')),
                  ],
                ),
              ),
            ] else if (_selectedGroupId == null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 32),
                child: Text(
                  'Join or create a group to see its activity.',
                  textAlign: TextAlign.center,
                  style: AppTextStyles.caption,
                ),
              )
            else if (_events.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 32),
                child: Text(
                  'No activity yet.',
                  textAlign: TextAlign.center,
                  style: AppTextStyles.caption,
                ),
              )
            else ...[
              for (final section in _sections) ActivityGroup(
                dateLabel: section.label,
                filter: _filter,
                events: section.events,
              ),
              if (_loadingMore)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (_pagination?.hasMore == true)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: AppButton(
                    label: 'Load More',
                    onPressed: _loadMore,
                  ),
                )
              else
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    "You're all caught up",
                    textAlign: TextAlign.center,
                    style: AppTextStyles.caption,
                  ),
                ),
            ],
          ],
        ),
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

  static String _dayKey(DateTime date) {
    final local = date.toLocal();
    return '${local.year}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}';
  }

  static String _dayLabel(String key) {
    final parts = key.split('-');
    final year = int.parse(parts[0]);
    final month = int.parse(parts[1]);
    final day = int.parse(parts[2]);
    final date = DateTime(year, month, day);
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final yesterday = today.subtract(const Duration(days: 1));
    if (date == today) return 'Today';
    if (date == yesterday) return 'Yesterday';
    final weekday = const [
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    ][date.weekday - 1];
    final isThisWeek = date.isAfter(today.subtract(const Duration(days: 7))) && date.isBefore(today);
    return isThisWeek ? weekday : '$day/${month.toString().padLeft(2, '0')}/$year';
  }
}

class _ActivityDaySection {
  const _ActivityDaySection({required this.label, required this.events});

  final String label;
  final List<ActivityEvent> events;
}
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/di/injection.dart';
import '../../../../core/network/api_exception_mapper.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/entrance.dart';
import '../../../../core/ui/responsive_content.dart';
import '../../../../core/ui/pressable_scale.dart';
import '../../../../core/utils/money.dart';
import '../../../auth/logic/auth_controller.dart';
import '../../../groups/data/repositories/groups_repository.dart';
import '../../../settlements/data/models/balance.dart';
import '../../../settlements/data/repositories/settlements_repository.dart';
import '../../../shell/presentation/widgets/hisab_header.dart';
import '../widgets/setting_row.dart';
import '../widgets/stat_card.dart';

/// Profile screen: user info from the authenticated session, live stats for
/// groups and balance totals, settings (local) and a real sign-out action.
class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  bool _notifications = true;

  int _groupCount = 0;
  int _owesMinorUnits = 0;
  int _owedMinorUnits = 0;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final groups = await getIt<GroupsRepository>().getGroups();
      final currentUserId = getIt<AuthController>().user?.id ?? '';
      var owes = 0;
      var owed = 0;
      for (final group in groups) {
        try {
          final List<GroupBalance> balances =
              await getIt<SettlementsRepository>().getGroupBalances(group.id);
          final mine = balances
              .where((b) => b.userId == currentUserId)
              .fold<int>(0, (sum, b) => sum + b.amountMinorUnits);
          if (mine < 0) owes += mine.abs();
          if (mine > 0) owed += mine;
        } catch (_) {
          // Balance stats are best-effort.
        }
      }
      if (!mounted) return;
      setState(() {
        _groupCount = groups.length;
        _owesMinorUnits = owes;
        _owedMinorUnits = owed;
      });
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(appErrorMessage(error))));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _signOut() async {
    await getIt<AuthController>().logout();
    if (!mounted) return;
    context.go('/sign-in');
  }

  @override
  Widget build(BuildContext context) {
    final user = getIt<AuthController>().user;
    return ResponsiveContent(
      child: ListView(
        padding: const EdgeInsets.only(bottom: 28),
        children: [
          const HisabHeader(title: 'Hisab'),
          const SizedBox(height: AppSpacing.large),

          // User card.
          Entrance(
            child: Card(
              margin: EdgeInsets.zero,
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.large),
                child: Row(
                  children: [
                    Container(
                      width: 64,
                      height: 64,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [AppColors.primary, AppColors.primaryDark],
                        ),
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.primary.withValues(alpha: 0.3),
                            blurRadius: 14,
                            offset: const Offset(0, 6),
                          ),
                        ],
                      ),
                      child: Text(
                        user?.initials ?? '?',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 24,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.medium),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(user?.name ?? 'Hisab User', style: AppTextStyles.title),
                          const SizedBox(height: 2),
                          Text(user?.email ?? '', style: AppTextStyles.caption),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.medium),

          // Stats row (live).
          Entrance(
            delay: const Duration(milliseconds: 100),
            child: Row(
              children: [
                StatCard(value: groupCountLabel, label: 'Groups'),
                const SizedBox(width: AppSpacing.small),
                StatCard(value: _loading ? '-' : _owsShort, label: 'You owe'),
                const SizedBox(width: AppSpacing.small),
                StatCard(value: _loading ? '-' : _owedShort, label: 'Owed to you'),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.large),

          // Settings.
          Entrance(
            delay: const Duration(milliseconds: 160),
            child: Text('Settings', style: AppTextStyles.sectionTitle),
          ),
          const SizedBox(height: AppSpacing.small),
          Entrance(
            delay: const Duration(milliseconds: 200),
            child: Card(
              margin: EdgeInsets.zero,
              child: Column(
                children: [
                  SettingRow(
                    icon: Icons.notifications_none,
                    label: 'Notifications',
                    trailing: Switch(
                      value: _notifications,
                      activeTrackColor: AppColors.primary,
                      onChanged: (value) =>
                          setState(() => _notifications = value),
                    ),
                  ),
                  const Divider(),
                  const SettingRow(
                    icon: Icons.currency_exchange,
                    label: 'Currency',
                    trailing: Text('PKR', style: AppTextStyles.caption),
                  ),
                  const Divider(),
                  const SettingRow(
                    icon: Icons.language,
                    label: 'Language',
                    trailing: Text('English', style: AppTextStyles.caption),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.large),

          // Sign out.
          Entrance(
            delay: const Duration(milliseconds: 240),
            child: PressableScale(
              onTap: _signOut,
              child: Container(
                height: 52,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.dangerSoft,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.logout, size: 20, color: AppColors.danger),
                    SizedBox(width: AppSpacing.small),
                    Text(
                      'Sign Out',
                      style: TextStyle(
                        color: AppColors.danger,
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String get groupCountLabel => _loading ? '-' : '$_groupCount';

  String get _owsShort => _shortMoney(_owesMinorUnits);
  String get _owedShort => _shortMoney(_owedMinorUnits);

  static String _shortMoney(int minorUnits) {
    // Show whole PKR without decimals, e.g. "1,250".
    return Money(minorUnits).format().replaceAll('PKR ', '').trim();
  }
}
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/entrance.dart';
import '../../../../core/ui/responsive_content.dart';
import '../../../../core/ui/pressable_scale.dart';
import '../../../../mock/mock_data.dart';
import '../../../shell/presentation/widgets/hisab_header.dart';
import '../widgets/setting_row.dart';
import '../widgets/stat_card.dart';

/// Profile screen: user info, stats and settings.
class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  bool _notifications = true;

  @override
  Widget build(BuildContext context) {
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
                        currentUser.initials,
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
                          Text(currentUser.name, style: AppTextStyles.title),
                          const SizedBox(height: 2),
                          Text(currentUser.email, style: AppTextStyles.caption),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.medium),

          // Stats row.
          Entrance(
            delay: const Duration(milliseconds: 100),
            child: const Row(
              children: [
                StatCard(value: '3', label: 'Groups'),
                SizedBox(width: AppSpacing.small),
                StatCard(value: '6', label: 'Friends'),
                SizedBox(width: AppSpacing.small),
                StatCard(value: '12', label: 'Settled'),
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
                  const Divider(),
                  const SettingRow(
                    icon: Icons.help_outline,
                    label: 'Help & Support',
                    trailing: Icon(
                      Icons.chevron_right,
                      color: AppColors.textSecondary,
                    ),
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
              onTap: () => context.go('/sign-in'),
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
}

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/di/injection.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/app_button.dart';
import '../../../../core/ui/app_logo.dart';
import '../../../../core/ui/app_text_field.dart';
import '../../../../core/ui/entrance.dart';
import '../../../../core/ui/responsive_content.dart';
import '../../logic/auth_controller.dart';
import '../widgets/field_label.dart';
import '../widgets/google_g.dart';

/// Sign-in screen backed by the real backend auth endpoints
/// (`POST /auth/login`). Field errors validate locally; server errors
/// (e.g. invalid credentials) surface in a banner.
class SignInPage extends StatefulWidget {
  const SignInPage({super.key});

  @override
  State<SignInPage> createState() => _SignInPageState();
}

class _SignInPageState extends State<SignInPage> {
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  AuthController get _auth => getIt<AuthController>();

  String? _emailError;
  String? _passwordError;
  String? _formError;
  bool _obscure = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    setState(() {
      _emailError = null;
      _passwordError = null;
      _formError = null;
    });

    final email = _emailController.text.trim();
    final password = _passwordController.text;
    if (email.isEmpty || !email.contains('@')) {
      setState(() => _emailError = 'Enter a valid email');
    }
    if (password.isEmpty) {
      setState(() => _passwordError = 'Enter your password');
    }
    if (_emailError != null || _passwordError != null) return;

    try {
      await _auth.login(email: email, password: password);
      if (!mounted) return;
      context.go('/shell');
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _formError = _auth.errorMessage ?? 'Unable to sign in. Please try again.';
      });
    }
  }

  void _notifyComingSoon(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final loading = _auth.isSubmitting;
    return Scaffold(
      body: ResponsiveContent(
        topPadding: 0,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 56),
              Entrance(
                child: Center(
                  child: Transform.scale(
                    scale: 0.9,
                    child: const AppLogo(size: 76),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.medium),
              Entrance(
                delay: const Duration(milliseconds: 120),
                child: Text(
                  'Welcome back. Keep your splits clear.',
                  textAlign: TextAlign.center,
                  style: AppTextStyles.caption.copyWith(fontSize: 14),
                ),
              ),
              const SizedBox(height: 40),

              if (_formError != null) ...[
                _ErrorBanner(message: _formError!),
                const SizedBox(height: AppSpacing.medium),
              ],

              // Email.
              Entrance(
                delay: const Duration(milliseconds: 200),
                child: const FieldLabel(text: 'EMAIL'),
              ),
              const SizedBox(height: AppSpacing.small),
              Entrance(
                delay: const Duration(milliseconds: 240),
                child: AppTextField(
                  controller: _emailController,
                  hintText: 'ali@example.com',
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  prefixIcon: const Icon(Icons.mail_outline, size: 20),
                  errorText: _emailError,
                  enabled: !loading,
                ),
              ),
              const SizedBox(height: AppSpacing.large),

              // Password.
              Entrance(
                delay: const Duration(milliseconds: 300),
                child: Row(
                  children: [
                    const Expanded(child: FieldLabel(text: 'PASSWORD')),
                    GestureDetector(
                      onTap: () => _notifyComingSoon('Password reset coming soon'),
                      child: Text(
                        'FORGOT?',
                        style: AppTextStyles.labelSmall.copyWith(
                          color: AppColors.primary,
                          letterSpacing: 0.8,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.small),
              Entrance(
                delay: const Duration(milliseconds: 340),
                child: AppTextField(
                  controller: _passwordController,
                  hintText: '••••••••',
                  obscureText: _obscure,
                  textInputAction: TextInputAction.done,
                  prefixIcon: const Icon(Icons.lock_outline, size: 20),
                  suffixIcon: IconButton(
                    onPressed: () => setState(() => _obscure = !_obscure),
                    icon: Icon(
                      _obscure ? Icons.visibility_off : Icons.visibility,
                      size: 20,
                    ),
                  ),
                  errorText: _passwordError,
                  enabled: !loading,
                  onChanged: (_) => setState(() {}),
                ),
              ),
              const SizedBox(height: AppSpacing.large),

              // Sign in.
              Entrance(
                delay: const Duration(milliseconds: 400),
                child: AppButton(
                  label: 'Sign In',
                  isLoading: loading,
                  onPressed: _signIn,
                ),
              ),
              const SizedBox(height: AppSpacing.large),

              // Divider.
              Entrance(
                delay: const Duration(milliseconds: 460),
                child: const Row(
                  children: [
                    Expanded(child: Divider()),
                    Padding(
                      padding: EdgeInsets.symmetric(
                        horizontal: AppSpacing.medium,
                      ),
                      child: Text(
                        'OR CONTINUE WITH',
                        style: AppTextStyles.labelSmall,
                      ),
                    ),
                    Expanded(child: Divider()),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.large),

              // Google.
              Entrance(
                delay: const Duration(milliseconds: 520),
                child: OutlinedButton(
                  onPressed: loading
                      ? null
                      : () => _notifyComingSoon('Google sign in coming soon'),
                  style: OutlinedButton.styleFrom(
                    backgroundColor: AppColors.surface,
                    foregroundColor: AppColors.textPrimary,
                    side: const BorderSide(color: AppColors.border),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      GoogleG(),
                      SizedBox(width: 12),
                      Text(
                        'Google',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.xl),

              // Footer.
              Entrance(
                delay: const Duration(milliseconds: 600),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      "Don't have an account? ",
                      style: AppTextStyles.bodyMedium.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                    GestureDetector(
                      onTap: () => context.push('/sign-up'),
                      child: Text(
                        'Sign up',
                        style: AppTextStyles.bodyMedium.copyWith(
                          color: AppColors.primary,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.danger.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.danger.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, size: 18, color: AppColors.danger),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: AppTextStyles.bodyMedium.copyWith(color: AppColors.danger),
            ),
          ),
        ],
      ),
    );
  }
}
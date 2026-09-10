import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/di/injection.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/ui/app_button.dart';
import '../../../../core/ui/app_text_field.dart';
import '../../../../core/ui/entrance.dart';
import '../../../../core/ui/responsive_content.dart';
import '../../logic/auth_controller.dart';
import '../widgets/field_label.dart';

/// Sign-up screen backed by `POST /auth/register`. Validates locally (name,
/// valid email, password length) then creates the account and session.
class SignUpPage extends StatefulWidget {
  const SignUpPage({super.key});

  @override
  State<SignUpPage> createState() => _SignUpPageState();
}

class _SignUpPageState extends State<SignUpPage> {
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  AuthController get _auth => getIt<AuthController>();

  String? _nameError;
  String? _emailError;
  String? _passwordError;
  String? _formError;
  bool _obscure = true;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _signUp() async {
    setState(() {
      _nameError = null;
      _emailError = null;
      _passwordError = null;
      _formError = null;
    });

    final name = _nameController.text.trim();
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    var valid = true;
    if (name.isEmpty) {
      _nameError = 'Enter your name';
      valid = false;
    }
    if (email.isEmpty || !email.contains('@')) {
      _emailError = 'Enter a valid email';
      valid = false;
    }
    if (password.length < 8) {
      _passwordError = 'Password must be at least 8 characters';
      valid = false;
    }
    if (!valid) {
      setState(() {});
      return;
    }

    try {
      await _auth.register(name: name, email: email, password: password);
      if (!mounted) return;
      context.go('/shell');
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _formError = _auth.errorMessage ?? 'Unable to create your account. Please try again.';
      });
    }
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
                    child: const Icon(
                      Icons.group_add_outlined,
                      size: 56,
                      color: AppColors.primary,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.medium),
              Entrance(
                delay: const Duration(milliseconds: 120),
                child: Text(
                  'Create your account. Keep your splits clear.',
                  textAlign: TextAlign.center,
                  style: AppTextStyles.caption.copyWith(fontSize: 14),
                ),
              ),
              const SizedBox(height: 40),

              if (_formError != null) ...[
                _ErrorBanner(message: _formError!),
                const SizedBox(height: AppSpacing.medium),
              ],

              Entrance(
                delay: const Duration(milliseconds: 200),
                child: const FieldLabel(text: 'NAME'),
              ),
              const SizedBox(height: AppSpacing.small),
              Entrance(
                delay: const Duration(milliseconds: 240),
                child: AppTextField(
                  controller: _nameController,
                  hintText: 'Ali Hassan',
                  textInputAction: TextInputAction.next,
                  prefixIcon: const Icon(Icons.person_outline, size: 20),
                  errorText: _nameError,
                  enabled: !loading,
                ),
              ),
              const SizedBox(height: AppSpacing.large),

              Entrance(
                delay: const Duration(milliseconds: 280),
                child: const FieldLabel(text: 'EMAIL'),
              ),
              const SizedBox(height: AppSpacing.small),
              Entrance(
                delay: const Duration(milliseconds: 320),
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

              Entrance(
                delay: const Duration(milliseconds: 360),
                child: const FieldLabel(text: 'PASSWORD'),
              ),
              const SizedBox(height: AppSpacing.small),
              Entrance(
                delay: const Duration(milliseconds: 400),
                child: AppTextField(
                  controller: _passwordController,
                  hintText: 'At least 8 characters',
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

              Entrance(
                delay: const Duration(milliseconds: 440),
                child: AppButton(
                  label: 'Create Account',
                  isLoading: loading,
                  onPressed: _signUp,
                ),
              ),
              const SizedBox(height: AppSpacing.xl),

              Entrance(
                delay: const Duration(milliseconds: 520),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      'Already have an account? ',
                      style: AppTextStyles.bodyMedium.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                    GestureDetector(
                      onTap: () => context.go('/sign-in'),
                      child: Text(
                        'Sign in',
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
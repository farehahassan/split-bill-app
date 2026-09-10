import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/di/injection.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/ui/app_logo.dart';
import '../../../auth/logic/auth_controller.dart';

/// Dark-green splash screen with a springy logo entrance. While the logo
/// animates, any stored session is validated against the backend; the app
/// then advances to the home shell (authenticated) or sign-in.
class SplashPage extends StatefulWidget {
  const SplashPage({super.key});

  @override
  State<SplashPage> createState() => _SplashPageState();
}

class _SplashPageState extends State<SplashPage>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  );
  late final Animation<double> _logoScale = CurvedAnimation(
    parent: _controller,
    curve: const Interval(0, 0.5, curve: Curves.easeOutBack),
  );
  late final Animation<double> _fade = CurvedAnimation(
    parent: _controller,
    curve: const Interval(0.45, 1, curve: Curves.easeOut),
  );
  late final Animation<Offset> _slide = Tween<Offset>(
    begin: const Offset(0, 0.1),
    end: Offset.zero,
  ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic));

  @override
  void initState() {
    super.initState();
    _restoreAndContinue(_controller.forward());
  }

  Future<void> _restoreAndContinue(TickerFuture animationDone) async {
    // Give the logo animation a chance to be seen even on a fast network.
    final auth = getIt<AuthController>();
    final restore = auth.restoreSession();

    // Wait for at least the minimum splash duration AND the session restore,
    // then route based on the resulting auth state.
    await Future.wait([animationDone, restore]);

    if (!mounted) return;
    context.go(auth.isAuthenticated ? '/shell' : '/sign-in');
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.primary,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ScaleTransition(
              scale: _logoScale,
              child: const AppLogo(size: 84, light: true),
            ),
            FadeTransition(
              opacity: _fade,
              child: SlideTransition(
                position: _slide,
                child: Padding(
                  padding: const EdgeInsets.only(top: 28),
                  child: Text(
                    'Keep your splits clear.',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.75),
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
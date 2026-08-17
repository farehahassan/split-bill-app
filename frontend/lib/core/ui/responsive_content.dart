import 'package:flutter/material.dart';

import '../utils/responsive.dart';

/// Wraps page content in a safe area and a centered column capped at
/// [Responsive.contentMaxWidth], so the phone-style UI stays balanced on
/// tablets and desktop while filling small phones edge to edge.
///
/// Replaces the old pattern of `SafeArea(child: ListView(padding: ...))` on
/// every page — horizontal padding is derived from the screen width.
class ResponsiveContent extends StatelessWidget {
  const ResponsiveContent({
    super.key,
    required this.child,
    this.topPadding = 12,
    this.bottomPadding = 28,
  });

  final Widget child;
  final double topPadding;
  final double bottomPadding;

  @override
  Widget build(BuildContext context) {
    final responsive = Responsive.of(context);
    return SafeArea(
      bottom: false,
      child: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(
            maxWidth: Responsive.contentMaxWidth,
          ),
          child: Padding(
            padding: EdgeInsets.fromLTRB(
              responsive.pagePadding,
              topPadding,
              responsive.pagePadding,
              bottomPadding,
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}

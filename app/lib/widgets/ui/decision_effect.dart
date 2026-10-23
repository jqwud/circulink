import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

import '../../core/theme.dart';

/// The decision moments that get a short effect (design spec, sections 7 and 10).
enum Decision {
  requestSent,
  gotItNow,
  approved,
  declined,
  creditBack,
  handover,
  returnedGood,
  returnProblem,
  giftListed,
  giftGiven
}

/// One meaning per motion: toward the person = "yours now", away = "given or sent", settle = "confirmed",
/// fade = "closed or declined".
enum _Motion { toward, away, settle, fade }

class _Spec {
  final IconData icon;
  final Color color;
  final _Motion motion;
  final int ms;
  final Curve curve;
  final String? badge; // a small "+1" that rises (a credit)
  final bool haptic;
  const _Spec(this.icon, this.color, this.motion, this.ms, this.curve,
      {this.badge, this.haptic = true});
}

const Map<Decision, _Spec> _specs = <Decision, _Spec>{
  Decision.requestSent: _Spec(
      Icons.outbox, HiColors.accent, _Motion.away, 450, Curves.easeInOutCubic),
  Decision.gotItNow: _Spec(Icons.celebration, HiColors.accent, _Motion.settle,
      500, Curves.easeOutBack),
  Decision.approved: _Spec(
      Icons.check_circle, HiColors.leaf, _Motion.settle, 350, Curves.easeOut),
  Decision.declined: _Spec(Icons.do_not_disturb_on_outlined, HiColors.muted,
      _Motion.fade, 300, Curves.easeIn,
      haptic: false),
  Decision.creditBack: _Spec(Icons.savings_outlined, HiColors.accent,
      _Motion.toward, 400, Curves.easeOutCubic,
      badge: '+1'),
  Decision.handover: _Spec(
      Icons.handshake, HiColors.leaf, _Motion.settle, 600, Curves.easeInOut),
  Decision.returnedGood: _Spec(Icons.assignment_turned_in, HiColors.leaf,
      _Motion.toward, 700, Curves.easeOutCubic),
  Decision.returnProblem: _Spec(
      Icons.support_agent, HiColors.warn, _Motion.fade, 250, Curves.easeOut,
      haptic: false),
  Decision.giftListed: _Spec(Icons.volunteer_activism, HiColors.accent,
      _Motion.away, 550, Curves.easeOutBack),
  Decision.giftGiven:
      _Spec(Icons.favorite, HiColors.danger, _Motion.away, 650, Curves.easeOut),
};

/// The longest an effect may take; the screen behind stays usable the whole time.
const Duration kEffectMax = Duration(milliseconds: 900);

/// How long [decision]'s effect takes (for tests and for anything waiting on it).
Duration effectDuration(Decision decision) =>
    Duration(milliseconds: _specs[decision]!.ms);

/// Learns once whether this phone keeps up with animation: if 3 of the first 10 frames of an effect take
/// longer than 32 ms, effects become simple fades from then on (and stay so after a restart via [store]).
class MotionBudget {
  MotionBudget._();
  static final MotionBudget instance = MotionBudget._();

  bool lowEnd = false;
  bool _measuring = false;
  int _frames = 0;
  int _slow = 0;
  void Function(bool lowEnd)? store;

  @visibleForTesting
  void reset() {
    lowEnd = false;
    _measuring = false;
    _frames = 0;
    _slow = 0;
    store = null;
  }

  /// Counts frames; exposed for tests.
  void addFrame(Duration total) {
    if (_frames >= 10) return;
    _frames++;
    if (total > const Duration(milliseconds: 32)) _slow++;
    if (_slow >= 3 && !lowEnd) {
      lowEnd = true;
      store?.call(true);
    }
  }

  void measure() {
    if (_measuring || _frames >= 10 || lowEnd) return;
    _measuring = true;
    void onTimings(List<FrameTiming> timings) {
      for (final FrameTiming t in timings) {
        addFrame(t.totalSpan);
      }
      if (_frames >= 10 || lowEnd) {
        SchedulerBinding.instance.removeTimingsCallback(onTimings);
        _measuring = false;
      }
    }

    SchedulerBinding.instance.addTimingsCallback(onTimings);
  }
}

/// Plays the effect for [decision] above the current screen. Never blocks: taps go through to the screen,
/// and the first tap also ends the effect. With "Remove animations" on (or Simple mode), nothing moves: only
/// the haptic tick; the screen's own sentence says what happened.
Future<void> playDecision(BuildContext context, Decision decision) async {
  final _Spec spec = _specs[decision]!;
  if (spec.haptic) unawaited(HapticFeedback.lightImpact());
  if (MediaQuery.maybeOf(context)?.disableAnimations ?? false) return;
  final OverlayState? overlay = Overlay.maybeOf(context, rootOverlay: true);
  if (overlay == null) return;
  MotionBudget.instance.measure();
  final Completer<void> done = Completer<void>();
  late OverlayEntry entry;
  void finish() {
    if (done.isCompleted) return;
    entry.remove();
    done.complete();
  }

  entry = OverlayEntry(
      builder: (BuildContext c) => _EffectLayer(
          spec: spec, simple: MotionBudget.instance.lowEnd, onDone: finish));
  overlay.insert(entry);
  return done.future;
}

class _EffectLayer extends StatefulWidget {
  final _Spec spec;
  final bool simple;
  final VoidCallback onDone;
  const _EffectLayer(
      {required this.spec, required this.simple, required this.onDone});

  @override
  State<_EffectLayer> createState() => _EffectLayerState();
}

class _EffectLayerState extends State<_EffectLayer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    // On a slow phone: a 200 ms fade only. The whole effect never runs past kEffectMax.
    final int ms = widget.simple ? 200 : widget.spec.ms;
    _c = AnimationController(
        vsync: this,
        duration:
            Duration(milliseconds: ms.clamp(0, kEffectMax.inMilliseconds)))
      ..forward().whenComplete(widget.onDone);
    // Any touch anywhere ends the effect; the touch itself still goes to the screen (the layer ignores it).
    GestureBinding.instance.pointerRouter.addGlobalRoute(_onPointer);
  }

  void _onPointer(PointerEvent e) {
    if (e is PointerDownEvent) widget.onDone();
  }

  @override
  void dispose() {
    GestureBinding.instance.pointerRouter.removeGlobalRoute(_onPointer);
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final _Spec s = widget.spec;
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: _c,
        builder: (BuildContext context, Widget? child) {
          final double t =
              widget.simple ? _c.value : s.curve.transform(_c.value);
          final double fadeOut =
              _c.value < 0.7 ? 1 : (1 - (_c.value - 0.7) / 0.3);
          double scale = 1;
          Offset shift = Offset.zero;
          double opacity = fadeOut;
          if (!widget.simple) {
            switch (s.motion) {
              case _Motion.settle:
                scale = 1.08 - 0.08 * t;
              case _Motion.away:
                shift = Offset(0, -60 * t);
                scale = 1 - 0.3 * t;
              case _Motion.toward:
                shift = Offset(0, 40 * (1 - t));
              case _Motion.fade:
                shift = Offset(0, 8 * t);
                opacity = fadeOut * (1 - 0.4 * t);
            }
          }
          return Center(
            child: Opacity(
              opacity: opacity.clamp(0, 1),
              child: Transform.translate(
                offset: shift,
                child: Transform.scale(
                  scale: scale,
                  child: Stack(
                      clipBehavior: Clip.none,
                      alignment: Alignment.center,
                      children: <Widget>[
                        Container(
                          width: 112,
                          height: 112,
                          decoration: BoxDecoration(
                              color: Colors.white,
                              shape: BoxShape.circle,
                              boxShadow: HiShadow.float),
                          child: Icon(s.icon, size: 64, color: s.color),
                        ),
                        if (s.badge != null)
                          Positioned(
                            top: -24 - 24 * t,
                            child: Text(s.badge!,
                                style: const TextStyle(
                                    fontSize: 28,
                                    fontWeight: FontWeight.w800,
                                    color: HiColors.accent)),
                          ),
                      ]),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/**
 * Orbe holográfico central (desenho original).
 * - idle: anéis girando devagar, núcleo "respirando".
 * - listening: ondas radiais seguem o volume real do microfone.
 * - processing: anéis aceleram e um arco "cometa" percorre a órbita.
 * - speaking: ondas pulsam em ritmo de fala.
 */
import { memo, useEffect } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from "react-native-svg";
import type { VoicePhase } from "@/logic/voiceMachine";
import { colors } from "@/theme";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const BARS = 56;
const PHASE_CODE: Record<VoicePhase, number> = { idle: 0, listening: 1, processing: 2, speaking: 3, error: 0 };

interface Props {
  phase: VoicePhase;
  /** Volume do microfone 0..1. */
  level: number;
  size?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
}

function arc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const toRad = (d: number) => ((d - 90) * Math.PI) / 180;
  const sx = cx + r * Math.cos(toRad(startDeg));
  const sy = cy + r * Math.sin(toRad(startDeg));
  const ex = cx + r * Math.cos(toRad(endDeg));
  const ey = cy + r * Math.sin(toRad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`;
}

function HoloOrbImpl({ phase, level, size = 290, onPress, onLongPress, accessibilityLabel }: Props) {
  const c = size / 2;
  const coreR = size * 0.2;
  const barInner = size * 0.255;
  const barMax = size * 0.13;

  const t = useSharedValue(0); // tempo contínuo 0..1 (loop)
  const spin = useSharedValue(0);
  const lvl = useSharedValue(0);
  const mode = useSharedValue(0);
  const cometOpacity = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [t]);

  useEffect(() => {
    mode.value = PHASE_CODE[phase];
    cometOpacity.value = withTiming(phase === "processing" ? 1 : 0, { duration: 250 });
    cancelAnimation(spin);
    const duration = phase === "processing" ? 1400 : phase === "listening" ? 9000 : 18000;
    spin.value = spin.value % 360;
    spin.value = withRepeat(withTiming(spin.value + 360, { duration, easing: Easing.linear }), -1, false);
  }, [phase, mode, spin, cometOpacity]);

  useEffect(() => {
    lvl.value = withSpring(level, { damping: 14, stiffness: 180 });
  }, [level, lvl]);

  // Barras radiais (ondas sincronizadas com a voz)
  const barsProps = useAnimatedProps(() => {
    const time = t.value * Math.PI * 2;
    let d = "";
    for (let i = 0; i < BARS; i++) {
      const a = (i / BARS) * Math.PI * 2;
      let amp: number;
      if (mode.value === 1) {
        // ouvindo: volume real modulado por ruído suave
        const jitter = 0.55 + 0.45 * Math.sin(time * 3 + i * 1.7) * Math.sin(i * 0.9 + time);
        amp = 0.06 + lvl.value * Math.abs(jitter);
      } else if (mode.value === 3) {
        // falando: ritmo de sílabas
        const env = 0.5 + 0.5 * Math.sin(time * 5.3) * Math.sin(time * 2.1 + 1);
        amp = 0.12 + 0.55 * Math.abs(env * Math.sin(i * 0.6 + time * 4));
      } else if (mode.value === 2) {
        amp = 0.05 + 0.08 * (0.5 + 0.5 * Math.sin(i * 0.5 - time * 6));
      } else {
        amp = 0.04 + 0.03 * (0.5 + 0.5 * Math.sin(i * 0.35 + time));
      }
      const r1 = barInner;
      const r2 = barInner + barMax * Math.min(1, amp);
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      d += `M${c + r1 * cos} ${c + r1 * sin}L${c + r2 * cos} ${c + r2 * sin}`;
    }
    return { d };
  });

  const corePulse = useDerivedValue(() => {
    const time = t.value * Math.PI * 2;
    if (mode.value === 1) return 1 + lvl.value * 0.12;
    if (mode.value === 3) return 1 + 0.05 * Math.abs(Math.sin(time * 5.3));
    if (mode.value === 2) return 1 + 0.03 * Math.sin(time * 4);
    return 1 + 0.025 * Math.sin(time);
  });

  const coreProps = useAnimatedProps(() => ({ r: coreR * corePulse.value }));
  const haloProps = useAnimatedProps(() => ({
    r: coreR * 1.25 * corePulse.value,
    opacity: mode.value === 0 ? 0.35 : 0.6,
  }));

  const ringA = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const ringB = useAnimatedStyle(() => ({ transform: [{ rotate: `${-spin.value * 0.6}deg` }] }));
  const comet = useAnimatedStyle(() => ({
    opacity: cometOpacity.value,
    transform: [{ rotate: `${spin.value * 2}deg` }],
  }));

  const accent = phase === "error" ? colors.red : phase === "speaking" ? colors.green : colors.cyan;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{ width: size, height: size }}
    >
      {/* Brilho de fundo e núcleo */}
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={accent} stopOpacity={0.28} />
            <Stop offset="55%" stopColor={colors.blue} stopOpacity={0.08} />
            <Stop offset="100%" stopColor={colors.bg} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="core" cx="45%" cy="40%" r="60%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.95} />
            <Stop offset="25%" stopColor={accent} stopOpacity={0.9} />
            <Stop offset="70%" stopColor={colors.blue} stopOpacity={0.55} />
            <Stop offset="100%" stopColor={colors.bg} stopOpacity={0.1} />
          </RadialGradient>
        </Defs>
        <Circle cx={c} cy={c} r={c} fill="url(#glow)" />
        <AnimatedPath animatedProps={barsProps} stroke={accent} strokeWidth={2.4} strokeLinecap="round" opacity={0.85} />
        <AnimatedCircle cx={c} cy={c} animatedProps={haloProps} fill="none" stroke={accent} strokeWidth={1} />
        <AnimatedCircle cx={c} cy={c} animatedProps={coreProps} fill="url(#core)" />
      </Svg>

      {/* Anel externo segmentado */}
      <Animated.View style={[StyleSheet.absoluteFill, ringA]}>
        <Svg width={size} height={size}>
          <G opacity={0.75}>
            {[0, 60, 120, 180, 240, 300].map((s) => (
              <Path key={s} d={arc(c, c, size * 0.46, s + 4, s + 44)} stroke={colors.cyan} strokeWidth={2} fill="none" strokeLinecap="round" />
            ))}
          </G>
          <Circle cx={c} cy={c} r={size * 0.43} stroke={colors.cyanFaint} strokeWidth={1} fill="none" strokeDasharray="2 6" />
        </Svg>
      </Animated.View>

      {/* Anel interno contrário */}
      <Animated.View style={[StyleSheet.absoluteFill, ringB]}>
        <Svg width={size} height={size}>
          <Circle cx={c} cy={c} r={size * 0.395} stroke={colors.cyanSoft} strokeWidth={1.2} fill="none" strokeDasharray="28 10 4 10" />
          {[0, 90, 180, 270].map((s) => (
            <Path key={s} d={arc(c, c, size * 0.37, s + 10, s + 35)} stroke={colors.violet} strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.7} />
          ))}
        </Svg>
      </Animated.View>

      {/* Cometa de processamento */}
      <Animated.View style={[StyleSheet.absoluteFill, comet]} pointerEvents="none">
        <Svg width={size} height={size}>
          <Path d={arc(c, c, size * 0.43, 0, 70)} stroke={colors.cyan} strokeWidth={3.5} fill="none" strokeLinecap="round" />
          <Circle cx={c + size * 0.43 * Math.cos(((70 - 90) * Math.PI) / 180)} cy={c + size * 0.43 * Math.sin(((70 - 90) * Math.PI) / 180)} r={4} fill="#FFFFFF" />
        </Svg>
      </Animated.View>

    </Pressable>
  );
}

export const HoloOrb = memo(HoloOrbImpl);

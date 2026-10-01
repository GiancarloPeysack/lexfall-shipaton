import { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, Easing, PanResponder, StyleSheet } from 'react-native';
import { t } from '../lib/i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useApp } from '../lib/app-state';
import { fonts, label, Palette } from '../theme/tokens';

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { name, palette: co } = useApp();
  const styles = makeStyles(co);

  // entrance
  const illoA = useRef(new Animated.Value(0)).current;
  const titleA = useRef(new Animated.Value(0)).current;
  const subA = useRef(new Animated.Value(0)).current;
  // looping swipe prompt
  const pulse = useRef(new Animated.Value(0)).current;
  const leaving = useRef(false);

  const go = () => {
    if (leaving.current) return;
    leaving.current = true;
    Animated.timing(illoA, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => {
      router.replace('/(tabs)');
    });
    Animated.timing(subA, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    Animated.timing(titleA, { toValue: 0, duration: 220, useNativeDriver: true }).start();
  };

  useEffect(() => {
    Animated.sequence([
      Animated.timing(illoA, { toValue: 1, duration: 760, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(titleA, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(subA, { toValue: 1, duration: 460, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy < -8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => { if (g.dy < -46 || g.vy < -0.35) go(); },
    })
  ).current;

  const illoStyle = {
    opacity: illoA,
    transform: [
      { translateY: illoA.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
      { scale: illoA.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
    ],
  };
  const titleStyle = {
    opacity: titleA,
    transform: [{ translateY: titleA.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  };
  const subStyle = {
    opacity: subA,
    transform: [{ translateY: subA.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  };
  const promptStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
    transform: [{ translateY: pulse.interpolate({ inputRange: [0, 1], outputRange: [4, -6] }) }],
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} {...pan.panHandlers}>
      <View style={styles.center}>
        <Animated.View style={illoStyle}>
          <Text style={styles.wordmark}>Lexfall</Text>
        </Animated.View>
        <Animated.Text style={[styles.title, titleStyle]}>
          {name ? `Welcome, ${name}` : 'Welcome'}
        </Animated.Text>
        <Animated.Text style={[styles.sub, subStyle]}>
          A sharper word every day - built around what you're curious about.
        </Animated.Text>
      </View>

      <Pressable style={[styles.prompt, { paddingBottom: insets.bottom + 26 }]} onPress={go} hitSlop={16}>
        <Animated.View style={[styles.promptInner, promptStyle]}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Path d="M6 14l6-6 6 6" stroke={co.accent} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Text style={styles.promptText}>{t('welcome.swipeUp')}</Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: co.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  wordmark: { fontFamily: fonts.serif, fontSize: 58, color: co.accent, letterSpacing: -1, textAlign: 'center' },
  title: { fontFamily: fonts.serif, fontSize: 32, color: co.text, textAlign: 'center', marginTop: 26 },
  sub: { fontFamily: fonts.sans, fontSize: 15.5, color: co.muted, textAlign: 'center', marginTop: 14, lineHeight: 23 },
  prompt: { alignItems: 'center' },
  promptInner: { alignItems: 'center', gap: 6 },
  promptText: { ...label, color: co.faint },
});

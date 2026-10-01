import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

// Last-resort catch for render errors so a bug shows a calm recovery screen instead
// of a white crash. Uses fixed brand colours (not the theme) so it renders even if
// app state / the palette is what failed. A crash reporter would hook into componentDidCatch.
type Props = { children: React.ReactNode };
type State = { error: Error | null };

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Lexfall] render error:', error?.message, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <View style={styles.wrap}>
          <Text style={styles.title}>Something slipped</Text>
          <Text style={styles.body}>A hiccup interrupted the app. Your words, saves and streak are safe.</Text>
          <Pressable style={styles.btn} onPress={this.reset}>
            <Text style={styles.btnTxt}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children as React.ReactElement;
  }
}

const INK = '#100E0B', BONE = '#ECE5D7', MUT = '#A39A88', GOLD = '#C6A85C';
const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  title: { fontFamily: 'Newsreader_500Medium', fontSize: 28, color: BONE, textAlign: 'center' },
  body: { fontFamily: 'Inter_400Regular', fontSize: 15, color: MUT, textAlign: 'center', lineHeight: 22 },
  btn: { backgroundColor: GOLD, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 32, marginTop: 8 },
  btnTxt: { fontFamily: 'Inter_600SemiBold', fontSize: 15.5, color: INK },
});

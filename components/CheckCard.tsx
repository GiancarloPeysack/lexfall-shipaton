import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { speakWord } from '../lib/speak';
import { Question } from '../lib/games';
import { fonts, label, Palette } from '../theme/tokens';
import PressBounce from './PressBounce';

// ONE check question for the daily test's learn-then-check session. Game.tsx stays the engine
// for whole ROUNDS (practice, onboarding, challenges); the daily session instead interleaves
// teach cards and single checks, so it needs a per-question unit it can place anywhere in its
// step queue. This deliberately reuses Game's question language 1:1 (same prompt/option/feedback
// layout, fills-only options, reveal-synced haptics, the "In context" line, auto-advance) so a
// check feels identical to every other quiz in the app - it just arrives one at a time.
//
// Recording is the PARENT's job (onAnswer) - this component never writes SRS/accuracy/skill
// rows itself, which is what lets the daily test record each word's FIRST check only and keep
// the fix-phase retests out of the stats (no double-count).
export default function CheckCard({ q, co, onAnswer, onContinue, hint }: {
  q: Question;
  co: Palette;
  // Fired once, the moment an option is picked (or Skip): ok = correct. Record here.
  onAnswer: (ok: boolean) => void;
  // Fired after the reveal pause - advance the session queue here.
  onContinue: (ok: boolean) => void;
  // RECALL-phase rescue (daily test only): the word's meaning, revealed on demand by a quiet
  // control. Using it counts as NOT recalled - onAnswer/onContinue fire with ok=false whatever
  // is then picked, exactly like Skip - so it can't game the advancement gate; it just unsticks
  // a stuck user, and the word gets re-taught + retested via the fix phase like any other miss.
  // Also upgrades the wrong/skip reveal into a real teach-at-the-point-of-failure (meaning +
  // "In context"). Omitted (every non-recall caller, and the formats where the meaning is
  // already on screen) = no control, byte-identical behavior.
  hint?: string;
}) {
  const styles = makeStyles(co);
  const [picked, setPicked] = useState<string | null>(null);
  const [hinted, setHinted] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const settle = (ok: boolean, delay: number) => {
    onAnswer(ok);
    timer.current = setTimeout(() => onContinue(ok), delay);
  };

  const choose = (opt: string) => {
    if (picked) return;
    setPicked(opt);
    const right = opt === q.answer;
    const ok = right && !hinted; // a hinted pick reports as NOT recalled, whatever was tapped
    // Same reveal-synced haptic as Game: success on right, WARNING (not error) on wrong - a
    // nudge, not a scold. The haptic follows the visible pick (a hinted-right tap still FEELS
    // right; only the record says otherwise). A wrong answer holds longer so the reveal can be
    // read - longer still when the meaning line joins it (the teach-at-failure moment).
    Haptics.notificationAsync(right ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    settle(ok, right ? (hinted ? 1400 : 1100) : hint ? 2400 : 1900);
  };

  // Skip = honest not-known (counts as wrong), briefly reveals the answer so it still teaches.
  // The sentinel locks input without matching any option (nothing shows as a wrong pick).
  const skip = () => {
    if (picked) return;
    setPicked(' skip');
    Haptics.selectionAsync().catch(() => {});
    settle(false, hint ? 2000 : 1600);
  };

  // The hint: show the meaning, keep the question open. The next pick records as not-recalled.
  const revealHint = () => {
    if (picked || hinted) return;
    setHinted(true);
    Haptics.selectionAsync().catch(() => {});
  };

  return (
    <View style={styles.center}>
      <Text style={[label, styles.prompt]}>{q.promptLabel}{q.promptKind === 'word' ? ' ?' : ''}</Text>
      {q.promptKind === 'word' ? (
        <>
          <Text style={styles.bigWord} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{q.prompt}</Text>
          {!!q.word.pos && <Text style={styles.pos}>({q.word.pos})</Text>}
          <Pressable onPress={() => speakWord(q.word.word, undefined, q.word.id)} hitSlop={12} accessibilityLabel={`Pronounce ${q.word.word}`} style={styles.sayBtn}>
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Path d="M11 5 6 9H3v6h3l5 4V5Z" stroke={co.muted} strokeWidth={1.6} fill="none" strokeLinejoin="round" />
              <Path d="M15.5 8.5a4.5 4.5 0 0 1 0 7" stroke={co.muted} strokeWidth={1.6} fill="none" strokeLinecap="round" />
            </Svg>
          </Pressable>
        </>
      ) : (
        <Text style={styles.def}>{q.prompt}</Text>
      )}

      <View style={{ marginTop: 26 }}>
        {q.options.map((opt, idx) => {
          const isCorrect = !!picked && opt === q.answer;
          const isWrong = picked === opt && opt !== q.answer;
          return (
            <Pressable
              key={`${opt}-${idx}`}
              onPress={() => choose(opt)}
              style={({ pressed }) => [styles.opt, pressed && !picked && styles.optPressed, isCorrect && styles.optOk, isWrong && styles.optBad]}
            >
              <Text style={[q.optionStyle === 'def' ? styles.optDef : styles.optWord, (isCorrect || isWrong) && { color: co.ink }]}>
                {opt}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!!hint && !hinted && !picked && (
        <PressBounce style={styles.hintBtn} onPress={revealHint} hitSlop={8}>
          <Text style={styles.hintTxt}>Reveal meaning</Text>
        </PressBounce>
      )}

      {!picked && (
        <Pressable style={styles.skipBtn} onPress={skip}>
          <Text style={styles.skipTxt}>Skip</Text>
        </Pressable>
      )}

      {/* Reserve the In-context line's space so revealing the answer never jumps the layout.
          With a hint available: the hint itself shows the meaning pre-answer, and a miss/skip
          reveals meaning + context together (the point-of-failure teach). */}
      <View style={styles.feedbackSlot}>
        {picked ? (
          <>
            {!!hint && (hinted || picked !== q.answer) && <Text style={styles.feedbackDef}>{hint}</Text>}
            <Text style={styles.feedback}>In context: {q.word.ex}</Text>
          </>
        ) : hinted ? (
          <Text style={styles.feedbackDef}>{hint}</Text>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (co: Palette) => StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 30 },
  prompt: { textAlign: 'center', color: co.muted },
  bigWord: { fontFamily: fonts.serif, fontSize: 44, color: co.text, textAlign: 'center', marginTop: 14, letterSpacing: 0.5 },
  pos: { fontFamily: fonts.sans, fontSize: 15, color: co.faint, textAlign: 'center', marginTop: 8 },
  sayBtn: { alignSelf: 'center', marginTop: 12, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: co.surface2 },
  def: { fontFamily: fonts.serif, fontSize: 23, color: co.text, textAlign: 'center', lineHeight: 32, marginTop: 16 },
  opt: { backgroundColor: co.line2, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 18, marginBottom: 14, minHeight: 58, justifyContent: 'center' },
  optPressed: { opacity: 0.72 },
  optOk: { backgroundColor: co.ok },
  optBad: { backgroundColor: co.bad },
  optWord: { fontFamily: fonts.serif, fontSize: 20, color: co.text, textAlign: 'center' },
  optDef: { fontFamily: fonts.sans, fontSize: 15, color: co.text, lineHeight: 21 },
  skipBtn: { backgroundColor: co.surface2, borderRadius: 13, paddingVertical: 16, alignItems: 'center', marginTop: 14 },
  skipTxt: { fontFamily: fonts.sansSemi, fontSize: 15.5, color: co.text },
  // Quiet text control (no fill, no border) so it reads as a rescue, not a third answer.
  hintBtn: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12, marginTop: 2 },
  hintTxt: { fontFamily: fonts.sansSemi, fontSize: 13.5, color: co.muted },
  feedbackSlot: { minHeight: 50, marginTop: 16, justifyContent: 'center' },
  feedback: { fontFamily: fonts.serifItalic, fontSize: 15, color: co.exText, textAlign: 'center', lineHeight: 22 },
  feedbackDef: { fontFamily: fonts.sans, fontSize: 14, color: co.text, textAlign: 'center', lineHeight: 20, marginBottom: 6 },
});

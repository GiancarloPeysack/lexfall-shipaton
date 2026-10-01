// Config plugin: persist Android Gradle settings across `expo prebuild`.
// android/ is a generated artifact, so gradle.properties tweaks must live here
// (in the shared config) rather than being hand-edited into android/.
//
// - Bumps the Gradle daemon heap: the default 2 GB OOMs ("Java heap space")
//   while transforming the Hermes AAR on this project.
// - Disables the legacy Jetifier: RN 0.74 is fully AndroidX, so Jetifier is
//   unnecessary and is what runs out of memory on the Hermes transform.
const { withGradleProperties } = require('@expo/config-plugins');

module.exports = function withGradleProps(config) {
  return withGradleProperties(config, (cfg) => {
    const set = (key, value) => {
      const found = cfg.modResults.find((i) => i.type === 'property' && i.key === key);
      if (found) found.value = value;
      else cfg.modResults.push({ type: 'property', key, value });
    };
    set('org.gradle.jvmargs', '-Xmx6144m -XX:MaxMetaspaceSize=1024m');
    set('android.enableJetifier', 'false');
    // AGP 8.2.1 (Expo SDK 51) predates compileSdk 35; suppress the "untested
    // compileSdk" hard check so we can target API 35 as Google Play now requires.
    set('android.suppressUnsupportedCompileSdk', '35');
    return cfg;
  });
};

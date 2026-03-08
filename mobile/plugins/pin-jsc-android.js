/**
 * Expo config plugin: pin io.github.react-native-community:jsc-android to an exact
 * version so Gradle does not request maven-metadata.xml from JitPack (dynamic versions
 * like 2026004.+ cause metadata fetch timeouts in remote builders).
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

const JSC_ANDROID_PINNED_VERSION = '2026004.0.0';

function withPinJscAndroid(config) {
  return withAppBuildGradle(config, (cfg) => {
    const contents = cfg.modResults.contents;
    const comment =
      '\n// Pin jsc-android to avoid JitPack maven-metadata.xml fetch (dynamic 2026004.+ times out in remote builders)\n';
    const block = `
configurations.all {
    resolutionStrategy {
        force 'io.github.react-native-community:jsc-android:${JSC_ANDROID_PINNED_VERSION}'
    }
}
`;
    if (contents.includes('jsc-android:') && contents.includes('resolutionStrategy')) {
      return cfg;
    }
    cfg.modResults.contents = contents + comment + block;
    return cfg;
  });
}

module.exports = withPinJscAndroid;

const { getDefaultConfig } = require('expo/metro-config');

// Use Metro's node file crawler instead of Watchman.
// This repo lives under ~/Downloads, which macOS restricts (TCC); the Watchman
// daemon can't read it, so Metro crashes ("Operation not permitted"). The node
// crawler runs in the CLI's own permission context and reads the folder fine.
// Harmless on other machines — it just skips Watchman.
const config = getDefaultConfig(__dirname);
config.resolver.useWatchman = false;

module.exports = config;

/** Native iOS widget target, built with @bacons/apple-targets. */
module.exports = {
  type: 'widget',
  name: 'VortoWidget',
  deploymentTarget: '17.0',
  // Shared App Group lets the RN app hand the curated word queue to the widget.
  entitlements: {
    'com.apple.security.application-groups': ['group.com.gpeysack.lexfall'],
  },
};

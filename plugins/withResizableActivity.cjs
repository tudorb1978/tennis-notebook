const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

// Keep window resizing explicit in generated native projects. Layout follows the
// current app window, including split-screen and desktop-style tablet windows.
module.exports = function withResizableActivity(config) {
  return withAndroidManifest(config, updated => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(updated.modResults);
    activity.$['android:resizeableActivity'] = 'true';
    return updated;
  });
};

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import type { ConfigPlugin, ExportedConfig } from 'expo/config-plugins';

const require = createRequire(import.meta.url);
const { AndroidConfig, IOSConfig } = require('expo/config-plugins') as typeof import('expo/config-plugins');
const withResizableActivity = require('../../plugins/withResizableActivity.cjs') as ConfigPlugin;
const root = fileURLToPath(new URL('../../', import.meta.url));
const config = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8')).expo as ExportedConfig;
type AndroidManifest = Parameters<typeof AndroidConfig.Orientation.setAndroidOrientation>[1];

function manifest(): AndroidManifest {
  return {
    manifest: {
      $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
      queries: [],
      application: [{
        $: { 'android:name': '.MainApplication' },
        activity: [{ $: {
          'android:name': '.MainActivity',
          'android:screenOrientation': 'portrait',
          'android:resizeableActivity': 'false',
          'android:windowSoftInputMode': 'adjustResize',
          'android:configChanges': 'keyboard|keyboardHidden|orientation|screenSize|screenLayout|smallestScreenSize',
        } }, { $: { 'android:name': '.OtherActivity' } }],
      }],
    },
  };
}

async function applyResizePlugin(nativeManifest: AndroidManifest): Promise<AndroidManifest> {
  const registered = withResizableActivity(structuredClone(config)) as ExportedConfig;
  const mod = registered.mods?.android?.manifest;
  assert.ok(mod, 'The plugin must register an Android manifest transformation.');
  const updated = await mod({
    ...registered,
    modResults: nativeManifest,
    modRequest: {
      projectRoot: root,
      platformProjectRoot: `${root}/android`,
      platform: 'android',
      modName: 'manifest',
      introspect: true,
    },
  } as Parameters<typeof mod>[0]);
  return updated.modResults;
}

test('The native configuration supports iPhones, iPads, rotation and iPad multitasking', () => {
  assert.equal(config.orientation, 'default');
  assert.equal(config.ios?.supportsTablet, true);
  assert.equal(config.ios?.requireFullScreen, false);
  assert.deepEqual(IOSConfig.DeviceFamily.getDeviceFamilies(config), [1, 2]);
  const plist = IOSConfig.RequiresFullScreen.setRequiresFullScreen(config, IOSConfig.Orientation.setOrientation(config, {}));
  const expected = [
    'UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown',
    'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight',
  ];
  assert.deepEqual(plist.UISupportedInterfaceOrientations, expected);
  assert.deepEqual(plist['UISupportedInterfaceOrientations~ipad'], expected);
  assert.equal(plist.UIRequiresFullScreen, false);
});

test('The registered Android plugin enables resizing without changing keyboard or activity behaviour', async () => {
  assert.ok(config.plugins?.includes('./plugins/withResizableActivity.cjs'));
  const input = manifest();
  const expected = structuredClone(input);
  const expectedActivity = AndroidConfig.Manifest.getMainActivityOrThrow(expected);
  expectedActivity.$['android:resizeableActivity'] = 'true';
  const updated = await applyResizePlugin(input);
  assert.deepEqual(updated, expected);
  assert.deepEqual(await applyResizePlugin(structuredClone(updated)), expected);

  const rotated = AndroidConfig.Orientation.setAndroidOrientation(config, updated);
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(rotated);
  assert.equal(activity.$['android:screenOrientation'], 'unspecified');
  assert.equal(activity.$['android:resizeableActivity'], 'true');
  assert.equal(activity.$['android:windowSoftInputMode'], 'adjustResize');
  assert.match(activity.$['android:configChanges'] ?? '', /orientation\|screenSize/);
});

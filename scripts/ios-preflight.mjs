import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ignore from 'ignore';

const require = createRequire(import.meta.url);
const { EasJsonAccessor, EasJsonUtils, Platform } = require('@expo/eas-json');
const { IOSConfig } = require('expo/config-plugins');
const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => readFileSync(path.join(root, name), 'utf8');
const checks = [];
const pass = message => { checks.push(message); console.log(`PASS ${message}`); };

function files(directory) {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const name = `${directory}/${entry.name}`;
    return entry.isDirectory() ? files(name) : [name];
  });
}

function pngInfo(name) {
  const bytes = readFileSync(path.resolve(root, name));
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${name}: expected PNG`);
  let transparentChunk = false;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const kind = bytes.toString('ascii', offset + 4, offset + 8);
    if (kind === 'tRNS') transparentChunk = true;
    offset += length + 12;
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25], transparentChunk };
}

async function main() {
  const accessor = EasJsonAccessor.fromProjectPath(root);
  const eas = await accessor.readAsync();
  const simulator = await EasJsonUtils.getBuildProfileAsync(accessor, Platform.IOS, 'simulator');
  const production = await EasJsonUtils.getBuildProfileAsync(accessor, Platform.IOS, 'production');
  await EasJsonUtils.getSubmitProfileAsync(accessor, Platform.IOS, 'production');
  assert.equal(eas.cli.appVersionSource, 'remote');
  assert.equal(simulator.simulator, true);
  assert.equal(simulator.withoutCredentials, true);
  assert.equal(simulator.autoIncrement, false);
  assert.equal(production.distribution, 'store');
  assert.equal(production.autoIncrement, true);
  assert.equal(production.credentialsSource, 'remote');
  for (const profile of [simulator, production]) {
    assert.equal(profile.buildConfiguration, 'Release');
    assert.equal(profile.image, 'auto');
    assert.equal(profile.developmentClient, undefined);
    assert.equal(profile.node, '24.21.0');
  }
  pass('Official EAS schema and resolved iOS simulator/store/submission profiles');

  const config = JSON.parse(execFileSync(process.execPath,
    [path.join(root, 'node_modules/expo/bin/cli'), 'config', '--type', 'introspect', '--json'], {
      cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1', EXPO_OFFLINE: '1' },
    }));
  const native = config._internal.modResults.ios;
  assert.equal(config.ios.bundleIdentifier, 'uk.tennisnotebook.app');
  assert.deepEqual(IOSConfig.DeviceFamily.getDeviceFamilies(config), [1, 2]);
  assert.equal(native.infoPlist.UIRequiresFullScreen, false);
  for (const name of ['UISupportedInterfaceOrientations', 'UISupportedInterfaceOrientations~ipad']) {
    assert.deepEqual(new Set(native.infoPlist[name]), new Set([
      'UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown',
      'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight',
    ]));
  }
  assert.equal(native.podfileProperties['ios.deploymentTarget'], '16.4');
  assert.equal(native.podfileProperties['apple.privacyManifestAggregationEnabled'], 'true');
  assert.equal(native.infoPlist.ITSAppUsesNonExemptEncryption, false);
  assert.match(native.infoPlist.CFBundleVersion, /^\d+(?:\.\d+){0,2}$/);
  pass('Native iPhone/iPad targeting, rotation, multitasking, minimum OS, build number and reviewed encryption flag');

  const icon = pngInfo(config.ios.icon);
  assert.deepEqual([icon.width, icon.height, icon.colorType, icon.transparentChunk], [1024, 1024, 2, false]);
  const splash = config.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen')?.[1]?.ios;
  assert.ok(splash?.image, 'Configure an iOS launch image.');
  pngInfo(splash.image);
  assert.equal(native.infoPlist.UILaunchStoryboardName, 'SplashScreen');
  pass('Opaque 1024px RGB iOS icon and configured branded launch screen');

  const upload = ignore().add(read('.easignore'));
  const required = ['app.json', 'eas.json', 'package.json', 'package-lock.json', 'index.ts', 'App.tsx', 'metro.config.cjs',
    ...files('src'), ...files('plugins'), ...files('assets')];
  for (const name of required) assert.equal(upload.ignores(name), false, `Cloud upload would omit ${name}`);
  for (const name of ['ios/Runner/Info.plist', 'android/app/build.gradle', 'node_modules/expo/package.json',
    'output/ios-bundle/test.js', 'credentials.json', 'AuthKey_test.p8', 'test.p12', 'test.mobileprovision', '.env.local']) {
    assert.equal(upload.ignores(name), true, `Cloud upload should omit ${name}`);
  }
  pass('EAS upload includes app source/plugins/fonts/assets and excludes generated projects, outputs and signing secrets');

  const manifests = [
    'node_modules/expo-file-system/ios/PrivacyInfo.xcprivacy',
    'node_modules/react-native/React/Resources/PrivacyInfo.xcprivacy',
  ];
  for (const name of manifests) assert.match(read(name), /NSPrivacyAccessedAPITypes/);
  pass('Installed FileSystem/React Native privacy manifests present; aggregation enabled');

  const pending = [];
  if (!config.owner || !config.extra?.eas?.projectId) pending.push('Expo account ownership and EAS project linking');
  pending.push('Apple individual membership, app registration, signing and App Store Connect setup',
    'Signed production archive compilation and final-archive privacy validation',
    'iPhone/iPad simulator and physical-device runtime checks');
  const report = { scope: 'local configuration preflight, not a native build or App Store approval',
    checkedAt: new Date().toISOString(), checks, pending,
    sdk: config.sdkVersion, bundleIdentifier: config.ios.bundleIdentifier,
    minimumIOS: native.podfileProperties['ios.deploymentTarget'],
    profiles: { simulator, production } };
  const output = path.join(root, 'output/ios-preflight');
  mkdirSync(output, { recursive: true });
  writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('\nLocal iOS preflight passed. Pending:');
  for (const item of pending) console.log(`- ${item}`);
  console.log('Report: output/ios-preflight/report.json');
}

main().catch(error => {
  console.error(`iOS preflight failed: ${error.message}`);
  process.exitCode = 1;
});

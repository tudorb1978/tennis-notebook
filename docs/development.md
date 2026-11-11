# App development and verification

## Local setup

Use Node.js 24.12 or later and run `npm ci`. The app uses Expo SDK 58 with its compatible React and React Native versions. Native Android builds require Java 21, Android SDK platform 37, and the build tools selected by the generated Gradle project.

Run `npm run check` for TypeScript, domain/storage tests, application-command tests, and dependency-boundary checks. Tests use the real SQLite engine through Node's SQLite module and cover database transactions, reopening saved records, revisions, backups, and report generation in addition to tennis rules. See [Application structure](architecture.md) for the separation between operations and layouts.

Run `npm run web -- --localhost --port 8093` for a local browser preview, or `npm start` for Expo development. The web preview uses expo-sqlite WebAssembly and cross-origin isolation headers configured in `metro.config.cjs`. It is a development preview; the Android APK contains its own JavaScript bundle for offline launch.

## iPhone/iPad preparation

Run `npm run doctor`, `npm run preflight:ios`, and `npm run bundle:ios` for dependency, generated native configuration, EAS schema/upload, asset, and JavaScript bundling checks. These do not compile or sign a native iOS binary. `eas.json` contains an unsigned simulator Release profile and a signed production/TestFlight profile. The project is linked to `@tudor-barbarosie/tennis-notebook`, and its first simulator cloud build succeeded on 11 November 2026 with Xcode 27.1. Simulator/device runtime testing, Apple setup, and the signed production build remain pending. See [iPhone/iPad build preparation](ios-release.md) for the build result, individual-account setup, and exact build/submission commands.

## Android build

The app name and Expo slug are `tennis-notebook`; both platform identifiers are `uk.tennisnotebook.app`. Native projects are generated from `app.json`. Regenerate them after identity changes; existing APKs still contain their original name and identifier.

Phone and tablet configuration allows portrait/landscape rotation, iPad multitasking, and Android activity resizing. The local `plugins/withResizableActivity.cjs` plugin is applied during native generation. See [Phone and tablet support](tablet-readiness.md) for layout expectations and the device-verification checklist.

Set `ANDROID_HOME` and `JAVA_HOME` for your installation, then run `bash scripts/build-android.sh`. A task-specific `GRADLE_USER_HOME` can be supplied to keep build caches separate. The script generates the native Android project from app configuration and writes the preview APK and its SHA-256 checksum under `output/android`.

The build includes arm64-v8a for phones and x86_64 for emulator verification. Minimum Android API is 24 and target API is 36. The APK is `output/android/tennis-notebook-preview.apk`, with a matching `.sha256` file. Native generated projects, caches, and signing files are excluded from source control. The generated release variant uses preview signing; do not use that signing configuration for a public store release.

## Browser application checks

Playwright is a pinned development dependency. Install its browser with `npx playwright install chromium`, or set `CHROME_EXECUTABLE` to use an existing Chrome binary, then run `npm run test:app` against the running preview. Set `PLAYWRIGHT_MODULE` if using a separate tooling installation and `APP_URL` to override the default preview address. `TEST_OUTPUT` controls the screenshot and export destination.

The application check runs the actual Expo interface and SQLite web worker. It creates a profile and match, records and edits strokes, reloads an unfinished match and pending entry, records with network access disabled, completes sets and a deciding match tie-break, exports CSV and a backup, restores into empty browser storage, and checks duplicate imports and narrow layout.

`npm run test:tablet` runs the tablet and resizable-window browser checks against the same preview. It is separate from native rotation, keyboard, sharing, and document-picker checks on iPad and Android tablets.

The older tests in `tests/prototype` apply to their corresponding inline prototype versions, rather than the native application.

`tests/app/android-smoke.py` installs an APK only on an explicitly selected emulator. It tests native SQLite, offline cold start, recovery of an unfinished point, persistent notes, and PDF sharing. Its reset flag is restricted to the dedicated temporary `tennis-tracker-test` AVD.

See [Phone and tablet support](tablet-readiness.md) for tablet verification results and the remaining iPad and physical-device checks.

PDF reports are generated locally with pdf-lib and an embedded DejaVu Sans font, independently of Android WebView or the system print renderer. The font's redistribution notice is included in the app assets. Unsupported font characters fail explicitly; CSV preserves the original text.

## Storage and ownership

`src/domain` is independent of UI and database libraries. `src/storage` stores versioned JSON match documents and their complete event history in SQLite, alongside tracked-player profiles and a resume pointer. Match saves compare revisions so stale writes cannot overwrite newer records. Creation and bulk import use transactions.

Each match has a complete scoring-rules snapshot and participant name snapshots. Outcome corrections do not invent observations. Statistics rebuild from effective points after edits and undo. The database schema and JSON backup format both have explicit versions; a newer unknown schema is rejected rather than reset.

## Public release work

Choose and preserve production signing credentials before public distribution, confirm the package identifier and product name, add privacy and support information, and test migrations and recovery on additional physical devices. Cloud services are not part of this build.

The current Expo CLI and fingerprint dependencies report moderate upstream glob/minimatch advisories affecting development tooling. No force downgrade or cross-major override is applied. Recheck supported Expo updates before a public release; these tools do not run inside the bundled Android app.

## Verified preview build

The verification below describes the earlier `uk.tennistracker.app` preview. A newly packaged `uk.tennisnotebook.app` APK needs its own native verification.

The current preview APK passed signature and checksum verification. Type checking and 54 automated domain, SQLite, backup, and PDF tests passed. The browser application test passed through match completion, PDF and CSV exports, and restore into empty storage. The APK also passed an Android 16 emulator trial: native recording, cold start with network disabled, recovery of a pending stroke, saved notes, detailed serve entry, and PDF sharing. A physical phone trial remains the next step.

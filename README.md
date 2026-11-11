# tennis-notebook

A courtside tennis recording app for parents and coaches, targeting iPhones, iPads, Android phones, and Android tablets. Match recording must work without an internet connection and support both quick point outcomes and more detailed serve and return observations.

The app should eventually be usable by other families. Player and match records are private by default; making the app public does not publish its users' data.

## App identity

- App name, Expo slug, npm package, and local folder: `tennis-notebook`.
- Android application ID and iOS bundle identifier: `uk.tennisnotebook.app`.
- URL scheme: `tennis-notebook`.

Android application IDs cannot contain hyphens, so the platform identifiers use `tennisnotebook`. The existing visual wordmark uses the stylized spelling “Tennis Notebook”.

Builds using this identifier install separately from earlier `uk.tennistracker.app` previews. Back up records in the old app and restore them in the renamed app before removing the old installation. The SQLite filename and backup format marker retain `tennis-tracker` for data compatibility.

## Technology decisions

- React Native and Expo for the mobile app.
- TypeScript for the app and independent tennis scoring and statistics logic.
- SQLite through expo-sqlite for local storage.
- Restorable backups and portable exports in the first usable release.
- Accounts, cloud synchronization, and coach access as later additions to the same architecture.

The first native trial device is an Android phone. Phone and tablet layouts share the application operations; native iOS and tablet verification are tracked separately.

## Design documents

- [Courtside workflow](docs/courtside-workflow.md) describes setup, recording, corrections, and reports.
- [Technical design](docs/technical-design.md) describes scoring, persistence, and a path to public use.
- [Application structure](docs/architecture.md) explains the boundaries between rules, application operations, layouts, and platform adapters.
- [Phone and tablet support](docs/tablet-readiness.md) describes rotation, window resizing, adaptive layouts, and native verification still required.
- [iPhone/iPad build preparation](docs/ios-release.md) covers local preflight, EAS profiles, individual account setup, and the first TestFlight trial.
- [Initial match formats](docs/match-formats.md) records the four supported presets and their explicit scoring rules.
- [Android trial](docs/android-trial.md) explains installation and what to try during a practice match.
- [Development](docs/development.md) covers builds, tests, storage, and remaining public-release work.

## Current stage

The Android application implements Quick endings with stroke selection, four match presets, player profiles, offline match history and recovery, serve and return observations, stroke statistics, point details and edits, undo, active-stage score corrections, suspension, retirement, and abandonment. It includes JSON backup/restore and PDF/CSV report exports.

SQLite saves each recording action before the app advances the score. Pending stroke selections and serve observations are also persisted. The existing JavaScript and Flutter projects remain reference material.

## Running the domain checks

Use Node.js 24.12 or later. Install dependencies with `npm ci`, then run `npm run check` for type checking and domain, storage, application, and dependency-boundary tests. `npm test` runs the tests alone. The actual application check is `tests/app/smoke.cjs`; the earlier interface checks remain separately in `tests/prototype`.

The source in `src/domain` has no dependency on Expo, React Native, SQLite, or cloud services. It can be connected to the Android interface without changing the tennis rules.

The next milestone is a practice-match trial on the user's Android phone. Additional formats will use the same scoring model and receive their own scoring tests before release.

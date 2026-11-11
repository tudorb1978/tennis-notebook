# iPhone/iPad build preparation

The local project is linked to [@tudor-barbarosie/tennis-notebook](https://expo.dev/accounts/tudor-barbarosie/projects/tennis-notebook), EAS project ID `9593c315-7eab-4491-9215-9618a293d286`. The first iOS simulator cloud build succeeded on 11 November 2026. Apple app registration, signing, runtime testing, and TestFlight submission remain pending.

iOS release work is paused after the successful simulator build. To resume, confirm Apple Account access and complete individual Developer Program enrollment before configuring signing.

## Local checks

Use Node.js 24.21.0, run `npm ci`, then:

```bash
npm run check
npm run doctor
npm run preflight:ios
npm run bundle:ios
```

`preflight:ios` uses the official EAS schema and resolved profiles, Expo's native configuration transformations, PNG metadata, and the upload ignore rules. It checks that source, configuration plugins, fonts, icons, and license assets reach cloud prebuild while generated projects, build outputs, environment files, and signing credentials remain excluded. It writes `output/ios-preflight/report.json` and states which external checks are still pending. `bundle:ios` writes the JavaScript/assets export to `output/ios-bundle`; this is not an installable iOS application or a native compilation.

Expo Doctor is pinned to 1.21.6: the published 1.21.7 bundle crashed before running its checks in the reviewed Node environment. Recheck a later supported version when updating tooling. EAS CLI and its schema tooling are pinned to 27.7.2. `npm run eas -- <command>` downloads/runs that CLI version through npx when needed; it does not require a global install.

At the pause checkpoint on 11 November 2026, TypeScript, all 109 tests, and the iOS preflight passed. Expo Doctor reported 19/20 checks passing: its SDK version check now recommends newer patches for `expo` (58.0.24), `expo-asset` (58.0.21), `expo-crypto` (58.0.8), `expo-document-picker` (58.0.5), `expo-keep-awake` (58.0.4), `expo-sharing` (58.0.23), `expo-sqlite` (58.0.16), and `expo-status-bar` (58.0.5). The lockfile retains the versions used for the successful simulator build. Review the current recommendations with `npx expo install --check` when resuming, and rerun validation and a native build after applying updates.

## Build profiles

| Profile | Output and purpose | Accounts |
| --- | --- | --- |
| `simulator` | Release build for the iOS Simulator; no development server or dev-client dependency | Expo account; no Apple signing credentials |
| `production` | Signed Release build for App Store Connect/TestFlight | Expo account and active Apple Developer membership |

Both profiles use Node 24.21.0 and Expo's `auto` iOS build image, selected for the installed Expo SDK. The first simulator build compiled successfully with Xcode 27.1 on `macos-tahoe-26.6-xcode-27.1-sdk-58` (macOS 26.6.2). The simulator artifact requires macOS/iOS Simulator to run; it cannot be installed on a physical iPhone or iPad.

Production uses remote Apple signing credentials and EAS-managed iOS build-number increments. The visible version remains in `app.json`; `ios.buildNumber: "1"` seeds initial setup, and subsequent production build numbers are managed remotely. Android's existing local-preview build script remains separate. No over-the-air update service or cloud persistence is configured.

The `production` submission profile intentionally has no account identifiers yet. Once the App Store Connect app exists, add its real numeric Apple ID as `submit.production.ios.ascAppId`. This is distinct from the bundle identifier `uk.tennisnotebook.app`. Do not put passwords, signing keys, or tokens in these files.

## Account setup for an individual publisher

1. Expo setup is complete for the requested owner account `tudor-barbarosie`. The local CLI signs in as `tudor.barbarosie`, which has Owner access to that account. Keep the distinction between the login username and project-owner namespace when checking access.
2. [Enroll in the Apple Developer Program as an individual](https://developer.apple.com/programs/enroll/), using an Apple Account with two-factor authentication. Apple handles payment and identity verification; an individual publisher's legal name appears as the seller. Confirm that the membership is active before requesting a signed device build.
3. Authenticate locally when ready:

   ```bash
   npm run eas -- login
   npm run eas -- whoami
   npm run eas -- init
   ```

   This project has already been linked using `init --account tudor-barbarosie`; it does not need to be initialized again. The real project ID is stored in `expo.extra.eas.projectId`, and `expo.owner` is `tudor-barbarosie`. For future setup, confirm the intended owner account before creating or relinking a project.

4. Register the explicit Apple App ID `uk.tennisnotebook.app` under the individual developer team and create the matching iOS app in App Store Connect. Record its numeric app ID for the submission profile. Apple Team ID can be selected during local authentication; add `appleTeamId` only if needed to disambiguate actual memberships.
5. Let EAS create/manage the distribution certificate and provisioning profile after selecting the correct Apple team. Use local interactive sign-in for passwords and two-factor codes. Keep any downloaded `.p8`, `.p12`, `.mobileprovision`, environment files, and `credentials.json` outside source control; ignore rules already cover them.

Expo-only setup can precede Apple's enrollment approval. An unsigned simulator build can check cloud native compilation while waiting for Apple membership, but physical-device/TestFlight installation still requires the signed route.

## First cloud build and private trial

To repeat the successful simulator build:

```bash
npm run build:ios:simulator
```

The first successful [EAS build](https://expo.dev/accounts/tudor-barbarosie/projects/tennis-notebook/builds/e9e4ecce-33d2-4e22-a82a-ee65d39f6272) is version `0.1.0`, build `1`, profile `simulator`, completed at 14:53 UTC on 11 November 2026. EAS built the uploaded local working tree, including the uncommitted iOS preparation changes; the displayed Git commit is not a complete source snapshot. The source fingerprint is `6ea3fb61e151e48dd0a603dfe6a63cde476bc0c7`.

The downloaded artifact is `output/ios/tennis-notebook-simulator.tar.gz` (20,562,933 bytes, SHA-256 `114db28bd1dded7dffd57f80d6ef3f7142d69bfdbae5263f0bf1fea8c7e0ae16`). Build metadata and package inspection reports are saved under ignored `output/ios-preflight/`. These outputs are local artifacts and are excluded from source control and future cloud uploads.

Static inspection of the compiled `.app` confirmed:

- Display name `tennis-notebook`, bundle identifier `uk.tennisnotebook.app`, version `0.1.0`, build `1`.
- iPhone and iPad device families, minimum iOS 16.4, all four orientations for both families, and no full-screen requirement.
- Both `x86_64` and `arm64` simulator slices in the executable and all eight bundled frameworks. Each slice identifies its platform as iOS Simulator; an `arm64` slice here does not permit physical-device installation.
- App icons, compiled asset catalog and launch storyboard, bundled JavaScript, both PDF fonts and their license.
- Eleven privacy manifests, including the app-level aggregate and the FileSystem framework's own declarations. See the privacy review below.

This verifies package contents and configuration, not visual appearance, successful launch, or runtime rotation/resizing. The package has simulator code-signature metadata but no provisioning profile or Apple distribution signing.

On a Mac with Xcode and an iOS Simulator installed, run this from the project to select a simulator and install the completed build:

```bash
npm run eas -- build:run --platform ios --id e9e4ecce-33d2-4e22-a82a-ee65d39f6272
```

Exercise both iPhone and iPad simulators before considering runtime behaviour verified. This Linux workstation can inspect the package but cannot run it.

The cloud builder reported a nonfatal failure installing its `sharp-cli` tool for Node 24.21.0 and an Expo module-provider visibility warning. Dependency installation, native generation, Xcode compilation, and artifact upload still succeeded. Revisit the builder/toolchain warnings when updating Expo; they did not block this build.

After Apple membership, app registration, and signing setup:

```bash
npm run build:ios:testflight
npm run submit:ios:testflight
```

The build and submission steps are separate. The submit command lets you select the intended build; check its version and build number. Uploading to App Store Connect does not publish the app publicly. After processing, configure the TestFlight tester group and install on an iPhone and an iPad. External beta testing can require Apple beta review.

Test offline cold launch, SQLite recovery, keyboard-open rotation and unsaved notes, iPad window resizing, PDF Quick Look, share cancellation, Save to Files, JSON import/restore, and an update that preserves existing records. See [Phone and tablet support](tablet-readiness.md) for the device checklist. Store screenshots, privacy/support pages, disclosures, age rating, and public App Review follow the private trial.

## Privacy and encryption review

The reviewed app has no app-owned remote API, analytics, advertising/tracking SDK, or separately implemented encryption. FileSystem and React Native include required-reason privacy manifests, and native generation keeps privacy aggregation enabled. The compiled simulator package contains eleven readable privacy manifests, all declaring tracking false and no collected data. The app-level aggregate includes React Native's required-reason entries; the bundled FileSystem framework separately declares its file-timestamp and disk-space reasons. This is package evidence rather than an App Store compliance certification. Inspect the signed production archive and its Xcode privacy report again before submission.

`ios.config.usesNonExemptEncryption` is false for the reviewed functionality. The app requests `randomUUID`; the installed iOS implementation uses the system UUID API. Available native crypto exports use Apple's CryptoKit/CommonCrypto, and SQLCipher is not enabled. Apple's [export-compliance reference](https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption) exempts encryption limited to Apple's operating system from documentation in App Store Connect. This flag means no non-exempt encryption; it does not mean the binary contains no cryptographic code. Review it again if introducing SQLCipher or custom encryption.

The current native modules declare an iOS 16.4 deployment minimum. The explicit iOS icon is an opaque 1024px RGB asset and the iOS launch screen uses the existing notebook/ball mark. See [Asset preflight](ios-asset-preflight.md). Native APIs for Quick Look, sharing, and document picking exist in the installed modules, but their behaviour on real iPhones/iPads remains unverified until the trial.

Sources: [Expo build configuration](https://docs.expo.dev/build/eas-json/), [version management](https://docs.expo.dev/build-reference/app-versions/), [upload rules](https://docs.expo.dev/build-reference/easignore/), [iOS submission](https://docs.expo.dev/submit/ios/), [privacy manifests](https://docs.expo.dev/guides/apple-privacy/).

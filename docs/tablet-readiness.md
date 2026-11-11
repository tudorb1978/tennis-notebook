# Phone and tablet support

The app targets iPhones, iPads, Android phones, and Android tablets with the same recording operations and saved-data formats. Cloud synchronization remains separate work; each installation keeps its own local records.

## Native configuration

`app.json` allows both portrait and landscape orientation. iOS enables both iPhone and iPad device families and allows multitasking. Expo generates all four supported iPad orientations and `UIRequiresFullScreen: false`.

The local `plugins/withResizableActivity.cjs` plugin explicitly enables Android activity resizing. It preserves the keyboard resize mode and the generated activity's configuration-change handling. Expo generates an unspecified screen orientation so the device and current app window can choose the appropriate orientation. Regenerate native projects after changing this configuration.

The generated iOS project has been inspected for both device families (`UIDeviceFamily` 1 and 2), all four orientations, and `UIRequiresFullScreen: false`; its deployment target is iOS 16.4. The Android build has minimum API 24 and target API 36. Inspecting generated iOS configuration does not verify an iOS binary or device behaviour.

## Layout behaviour

Layouts follow the available app window and measured content area, rather than a device-model label. A tablet in a narrow split-screen window uses the compact layout. Match recording and setup remain comfortably bounded; the library and reports can use a wider area. Dialogs are bounded by the current window and remain scrollable in shorter landscape windows.

The main Android screen uses native window resizing. Native dialogs also apply keyboard padding against their current frame, keeping Save actions above the keyboard during rotation without relying on a cached dialog height. Focused-field scrolling accounts for a fixed Save footer beneath the scroll area.

Keep the application controller mounted while resizing. Responsive components change flex styles within the same component tree, preserving unsaved form text, selected report filters, open dialogs, and durable recording drafts. Width and orientation must not appear in component keys or decide whether to recreate the controller.

The existing native file adapters handle PDF/CSV sharing and JSON backup import/export. Expo's sharing module anchors iPad popovers against the current native window; the app does not substitute physical-screen coordinates. These native interactions still require device verification.

## Automated checks

- `npm run check` includes the native configuration transformations, iPhone/iPad device families, all supported orientations, iPad multitasking, and Android resizing. It also checks business rules, storage, commands, and architecture boundaries.
- `npm run test:tablet` runs the tablet browser checks in `tests/app/tablet.cjs`. Use `APP_URL` to point to the running Expo web preview and `CHROME_EXECUTABLE` when using an existing Chrome installation.
- `npm run test:app` retains the full phone-sized recording, recovery, editing, report, and backup/restore checks.

Browser resizing verifies responsive presentation and state retention. It does not establish that native iPad or Android tablet integrations work.

## Verification results

The preview APK builds successfully and its signature and SHA-256 checksum verify. The phone and tablet browser suites have passed, including rotation/resizing, retained setup and note text, recording drafts, wide reports, PDF generation, and JSON backup/restore.

The generated iOS project has been inspected for both device families, all iPad orientations, and `UIRequiresFullScreen: false`. This is configuration verification, not an iOS build or device test.

Automated native Android verification did not complete: the system hierarchy reader could not reliably snapshot the ticking scoreboard. No native automation pass is claimed. The experimental reader was not added to the repository. Physical device verification remains separate.

## Manual Android tablet observations

On the disposable Pixel Tablet emulator running Android 16/API 36 (2560 × 1600, density 320), the new standalone APK was checked using screenshots:

- Typed player/opponent names survived rotation with the software keyboard open.
- A recorded point and the 15–0 score survived landscape/portrait rotation.
- An unfinished second-serve entry, following a first-serve fault, survived rotation and an offline force-stop/relaunch.
- On the final keyboard-adjusted build, the note input and full Save notes button were visible together above the software keyboard in both orientations. Unsaved note text survived keyboard-open rotation.
- A native match-summary PDF opened Android's share chooser. Cancelling returned to the prepared report with its View and Share actions available.

These observations apply to the tested emulator and build. They are not a pass for actual Android split-screen, physical hardware, or iPad integrations.

## Native verification before release

Use the checklist below for the remaining coverage and physical device trials. The manual emulator observations above cover only the stated scenarios; physical iPad and Android tablet trials are still required.

- Launch and record a match in portrait and landscape, including an offline cold start.
- Rotate and resize during setup, an unfinished serve/return or stroke entry, and an unsaved notes edit. Preserve the score, draft answers, and typed text.
- Exercise iPad split-screen/windowed operation and Android split-screen, including a narrow window and a short landscape window.
- Open setup, correction, notes, player settings, and restore dialogs with the software keyboard visible. Check that focused fields and save/cancel actions remain reachable. Repeat with a hardware keyboard.
- Test large text, VoiceOver or TalkBack, and controls at the edges of the app window.
- Open and share every PDF variant, export CSV and JSON, import a JSON backup through Files/the Android document picker, and cancel each native chooser safely.
- Close and reopen the app during a saved recording draft; update the app and verify that records and reports are preserved.

No iOS binary or physical iPad interaction has been verified in the Linux development environment. Record device model, operating-system version, app build, and results when those checks are completed.

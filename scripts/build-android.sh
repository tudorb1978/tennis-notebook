#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

CI=1 EXPO_NO_TELEMETRY=1 npm exec expo prebuild -- --platform android --no-install
(
  cd android
  CI=1 EXPO_NO_TELEMETRY=1 ./gradlew :app:assembleRelease -x lint -x test --no-daemon --max-workers=2 -PreactNativeArchitectures=arm64-v8a,x86_64
)
mkdir -p output/android
cp android/app/build/outputs/apk/release/app-release.apk output/android/tennis-notebook-preview.apk
sha256sum output/android/tennis-notebook-preview.apk > output/android/tennis-notebook-preview.apk.sha256

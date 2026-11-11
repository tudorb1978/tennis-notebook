# iOS icon and launch assets

The existing notebook-and-ball design is retained. No generated artwork or new branding is introduced.

| Asset | Dimensions and format | Purpose/source |
| --- | --- | --- |
| `assets/tennis-notebook-ios.png` | 1024 × 1024, RGB PNG, no alpha channel | Explicit iOS icon rendered from `assets/tennis-notebook.svg` |
| `assets/tennis-notebook-splash.png` | 1024 × 1024, RGBA PNG, transparent background | Launch mark rendered from `assets/tennis-notebook-splash.svg` |

The iOS icon's RGB pixels match the existing `assets/tennis-notebook.png` exactly. The original PNG has an alpha channel with every alpha value equal to 255; it has no visible transparency. The previously generated native AppIcon was already RGB. The explicit iOS asset makes the intended format independent of that conversion step.

The launch SVG is the existing editable icon SVG with only its full-canvas dark background rectangle removed. Its shapes and gradients remain unchanged. Display it centred over the app background `#f4f5ed`, using the `expo-splash-screen` config plugin with an image width around 200 logical points. The PNG's 1024-pixel source supports high-density display without stretching the existing 160-pixel in-app mark.

Regenerate from the SVG sources using the project's existing FFmpeg/librsvg toolchain:

```bash
ffmpeg -v error -y -c:v librsvg -i assets/tennis-notebook.svg \
  -frames:v 1 -update 1 -pix_fmt rgb24 assets/tennis-notebook-ios.png
ffmpeg -v error -y -c:v librsvg -i assets/tennis-notebook-splash.svg \
  -frames:v 1 -update 1 -pix_fmt rgba assets/tennis-notebook-splash.png
```

Local checks verified dimensions, RGB/no-alpha icon format, exact icon pixel equivalence, and splash alpha range 0–255. The icon and a splash composite on the app background were visually inspected. After applying the config, native generation produced an RGB 1024px AppIcon and 200px, 400px, and 600px launch images referenced by the launch storyboard. The first successful simulator cloud build also contains app icons, a compiled asset catalog, and the compiled `SplashScreen` storyboard. Static inspection cannot verify the compiled asset catalog's appearance; launch testing on iPhone/iPad simulators and physical devices remains pending. See the [build result](ios-release.md#first-cloud-build-and-private-trial).

Expo recommends a 1024-pixel transparent PNG for the launch mark and release-build testing for launch appearance: [Splash screen and app icon](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/), [SplashScreen](https://docs.expo.dev/versions/latest/sdk/splash-screen/).

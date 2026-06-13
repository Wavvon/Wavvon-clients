# Android Release Signing

Release APKs are signed with a single long-lived self-signed keystore.
**Losing this keystore forces every existing user to uninstall and reinstall**
(Android refuses cross-signature upgrades). Back it up out-of-band.

## Generate the keystore (one-time)

Run this once and store the output file somewhere safe:

```
keytool -genkey -v \
  -keystore voxply.keystore \
  -alias voxply \
  -keyalg RSA \
  -keysize 4096 \
  -validity 36500
```

`36500` days = 100 years. Use a strong password and fill in reasonable
Distinguished Name values when prompted.

## Store secrets in GitHub

| Secret name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 voxply.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password you chose |
| `ANDROID_KEY_PASSWORD` | the key password (can be the same) |

Settings → Secrets and variables → Actions → New repository secret.

## Local release build

```
set TAURI_ANDROID_KEYSTORE_PATH=C:\path\to\voxply.keystore
set TAURI_ANDROID_KEYSTORE_PASSWORD=yourpassword
set TAURI_ANDROID_KEY_ALIAS=voxply
set TAURI_ANDROID_KEY_PASSWORD=yourpassword

cargo tauri android build --target aarch64-linux-android
```

The signed APK lands at:
`src-tauri/gen/android/app/build/outputs/apk/universal/release/`

## Debug builds

`cargo tauri android build --debug` uses Android's debug key automatically.
Debug APKs cannot be upgraded to release-signed APKs without uninstalling first.

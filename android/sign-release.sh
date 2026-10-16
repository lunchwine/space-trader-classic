#!/usr/bin/env bash
# Sign the unsigned release APK with the persistent developer key (kept OUTSIDE the repo).
#   android/sign-release.sh                # sign, write space-trader-classic-<version>.apk next to this script's build output
#   STC_KEYSTORE=/path/key.jks android/sign-release.sh
# The keystore password is read from a hidden prompt (or STC_KS_PASS in the environment) and is never printed.
# Create the key once, outside the repo:
#   keytool -genkeypair -v -keystore ~/.android-keys/space-trader-classic.jks -alias spacetraderclassic \
#           -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=lunchwine"
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
ks="${STC_KEYSTORE:-$HOME/.android-keys/space-trader-classic.jks}"
alias_="${STC_KEY_ALIAS:-spacetraderclassic}"
sdk="${ANDROID_HOME:?set ANDROID_HOME}"
apksigner="$(ls -d "$sdk"/build-tools/35.0.0/apksigner)"
version="$(sed -n "s/.*versionName '\(.*\)'.*/\1/p" "$here/app/build.gradle")"
in="$here/app/build/outputs/apk/release/app-release-unsigned.apk"
out="${1:-$here/app/build/outputs/space-trader-classic-$version.apk}"
[ -f "$ks" ] || { echo "Keystore not found: $ks" >&2; exit 1; }
[ -f "$in" ] || { echo "Build first: ./gradlew assembleRelease" >&2; exit 1; }
if [ -z "${STC_KS_PASS:-}" ]; then read -r -s -p "Keystore password: " STC_KS_PASS; echo; fi
export STC_KS_PASS
# Assumes the key password equals the keystore password (keytool's default when you press Enter).
# --alignment-preserved: keep Gradle's zip padding. F-Droid copies this signature onto its own unsigned build,
# so the signed APK must differ from the unsigned one only by the signature, or verification fails.
"$apksigner" sign --ks "$ks" --ks-key-alias "$alias_" --ks-pass env:STC_KS_PASS --key-pass env:STC_KS_PASS \
  --min-sdk-version 24 --alignment-preserved --out "$out" "$in"
"$apksigner" verify --verbose --print-certs "$out" | grep -E 'Verifies|v[0-9] scheme|SHA-256 digest' | grep -v 'Signer #[0-9]* certificate public key'
echo "Signed: $out"
sha256sum "$out"

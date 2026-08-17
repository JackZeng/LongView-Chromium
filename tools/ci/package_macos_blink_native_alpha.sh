#!/usr/bin/env bash
set -euo pipefail

: "${CHROMIUM_APP:?CHROMIUM_APP is required}"
: "${OUTPUT_APP:?OUTPUT_APP is required}"
: "${LONGVIEW_VERSION:?LONGVIEW_VERSION is required}"
: "${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"

rm -rf "$OUTPUT_APP"
contents="$OUTPUT_APP/Contents"
macos="$contents/MacOS"
resources="$contents/Resources"
mkdir -p "$macos" "$resources"
cp -R "$CHROMIUM_APP" "$resources/Chromium.app"
cp -R "$GITHUB_WORKSPACE/product/extension" "$resources/LongViewExtension"

cat > "$RUNNER_TEMP/LongViewNativeLauncher.swift" <<'SWIFT'
import Foundation

let fm = FileManager.default
guard let resources = Bundle.main.resourceURL else {
    fputs("LongView Native Alpha: resources unavailable\n", stderr)
    exit(2)
}
let chromium = resources.appendingPathComponent("Chromium.app/Contents/MacOS/Chromium")
let longViewExtension = resources.appendingPathComponent("LongViewExtension")
guard fm.isExecutableFile(atPath: chromium.path) else {
    fputs("LongView Native Alpha: compiled Chromium executable missing\n", stderr)
    exit(3)
}
guard fm.fileExists(atPath: longViewExtension.appendingPathComponent("manifest.json").path) else {
    fputs("LongView Native Alpha: LongView runtime missing\n", stderr)
    exit(4)
}

let profile = fm.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Application Support/LongView Chromium Native Alpha/Profile", isDirectory: true)
do {
    try fm.createDirectory(at: profile, withIntermediateDirectories: true)
} catch {
    fputs("LongView Native Alpha: cannot create profile: \(error)\n", stderr)
    exit(5)
}

var arguments = [
    "--user-data-dir=\(profile.path)",
    "--no-first-run",
    "--no-default-browser-check",
    "--enable-blink-features=LongViewSegmentLifecycle",
    "--disable-extensions-except=\(longViewExtension.path)",
    "--load-extension=\(longViewExtension.path)",
    "--enable-logging=stderr"
]
arguments.append(contentsOf: CommandLine.arguments.dropFirst())

let child = Process()
child.executableURL = chromium
child.arguments = arguments
do {
    try child.run()
    child.waitUntilExit()
    exit(child.terminationStatus)
} catch {
    fputs("LongView Native Alpha: launch failed: \(error)\n", stderr)
    exit(6)
}
SWIFT

xcrun swiftc -O "$RUNNER_TEMP/LongViewNativeLauncher.swift" -o "$macos/LongViewNativeLauncher"
file "$macos/LongViewNativeLauncher" | tee "$RUNNER_TEMP/longview-native-launcher-file.txt"
grep -q arm64 "$RUNNER_TEMP/longview-native-launcher-file.txt"

cat > "$contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDevelopmentRegion</key><string>en</string>
<key>CFBundleDisplayName</key><string>LongView Chromium Native Alpha</string>
<key>CFBundleExecutable</key><string>LongViewNativeLauncher</string>
<key>CFBundleIdentifier</key><string>io.longview.chromium.native-alpha</string>
<key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
<key>CFBundleName</key><string>LongView Chromium Native Alpha</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${LONGVIEW_VERSION}</string>
<key>CFBundleVersion</key><string>${GITHUB_RUN_ID}</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
plutil -lint "$contents/Info.plist"
python3 -m json.tool "$resources/LongViewExtension/manifest.json" >/dev/null

codesign --force --deep --sign - --timestamp=none "$OUTPUT_APP"
codesign --verify --deep --strict --verbose=2 "$OUTPUT_APP"

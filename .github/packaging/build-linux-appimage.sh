#!/usr/bin/env bash
# Build a Linux AppImage from electrobun's app bundle.
#
# electrobun 1.18.1's self-extracting Linux installer (-Setup.tar.gz) uses a
# minimal tar parser that can't read the extended (PAX/GNU) headers GNU tar
# emits for paths > 100 chars. This app's node_modules has thousands of such
# paths, so that installer aborts with TarUnsupportedFileType. AppImage uses
# squashfs (no tar), so it sidesteps the bug entirely.
#
# We rebuild from the .tar.zst bundle electrobun already produced (the app
# bundle dir itself is deleted by electrobun after tarring).
set -euo pipefail

ZST=artifacts/stable-linux-x64-Testeiya.tar.zst
ICON=assets/icon.png
OUT=artifacts/Testeiya-x86_64.AppImage
APPDIR=Testeiya.AppDir

rm -rf "$APPDIR"
mkdir -p "$APPDIR"

echo "Extracting app bundle from $ZST ..."
zstd -dc "$ZST" | tar -x -C "$APPDIR"
test -x "$APPDIR/Testeiya/bin/launcher"

cat > "$APPDIR/AppRun" <<'EOF'
#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
# The @oh-my-pi/pi-natives addon needs extra static-TLS surplus or it fails to
# dlopen with "cannot allocate memory in static TLS block" (same workaround the
# desktop:dev script uses). Inherited by the launcher's spawned bun worker.
export GLIBC_TUNABLES="glibc.rtld.optional_static_tls=20480"
exec "$HERE/Testeiya/bin/launcher" "$@"
EOF
chmod +x "$APPDIR/AppRun"

cat > "$APPDIR/Testeiya.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Testeiya
Exec=AppRun
Icon=testeiya
Categories=Development;Utility;
Terminal=false
EOF

cp "$ICON" "$APPDIR/testeiya.png"
cp "$ICON" "$APPDIR/.DirIcon"

echo "Fetching appimagetool ..."
wget -q https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage -O appimagetool
chmod +x appimagetool

echo "Building AppImage ..."
# --appimage-extract-and-run avoids needing FUSE on the CI runner.
APPIMAGE_EXTRACT_AND_RUN=1 ARCH=x86_64 ./appimagetool "$APPDIR" "$OUT"

echo "Removing the broken self-extracting installer ..."
rm -f artifacts/stable-linux-x64-Testeiya-Setup.tar.gz
rm -rf "$APPDIR" appimagetool

ls -la "$OUT"

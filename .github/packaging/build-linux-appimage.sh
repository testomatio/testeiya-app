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

# electrobun's native wrapper hardcodes the X11 WM_CLASS to its example name
# "ElectrobunKitchenSink-dev", which GNOME shows as the app title and uses to
# map the dock icon. Rewrite that null-terminated string in place to "Testeiya"
# (same byte length, null-padded — keeps the ELF intact).
echo "Patching WM_CLASS in libNativeWrapper.so ..."
python3 - "$APPDIR/Testeiya/bin/libNativeWrapper.so" <<'PY'
import sys
p = sys.argv[1]
d = bytearray(open(p, 'rb').read())
key = b'ElectrobunKitchenSink'
i = d.find(key)
if i == -1:
    print("WM_CLASS string not found — wrapper layout changed; leaving as-is")
    sys.exit(0)
end = d.index(b'\x00', i)            # extend to the C-string terminator
new = b'Testeiya'.ljust(end - i, b'\x00')
d[i:end] = new
open(p, 'wb').write(d)
print(f"patched WM_CLASS at {i} (len {end - i}) -> Testeiya")
PY

cat > "$APPDIR/AppRun" <<'EOF'
#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
# The @oh-my-pi/pi-natives addon needs extra static-TLS surplus or it fails to
# dlopen with "cannot allocate memory in static TLS block" (same workaround the
# desktop:dev script uses). Inherited by the launcher's spawned bun worker.
export GLIBC_TUNABLES="glibc.rtld.optional_static_tls=20480"

# Best-effort desktop integration so the dock/taskbar shows the Testeiya icon.
# GNOME/KDE map the window (WM_CLASS=Testeiya) to a .desktop via StartupWMClass;
# on Wayland this is the only way to get a window icon. Idempotent, silent.
if [ -n "${HOME:-}" ]; then
  _exec="${APPIMAGE:-$HERE/AppRun}"
  _appdir="$HOME/.local/share/applications"
  _icondir="$HOME/.local/share/icons/hicolor/256x256/apps"
  mkdir -p "$_appdir" "$_icondir" 2>/dev/null || true
  cp -f "$HERE/testeiya.png" "$_icondir/testeiya.png" 2>/dev/null || true
  cat > "$_appdir/testeiya.desktop" 2>/dev/null <<DESK || true
[Desktop Entry]
Type=Application
Name=Testeiya
Exec=$_exec
Icon=testeiya
StartupWMClass=Testeiya
Categories=Development;Utility;
Terminal=false
DESK
  update-desktop-database "$_appdir" >/dev/null 2>&1 || true
  gtk-update-icon-cache -t "$HOME/.local/share/icons/hicolor" >/dev/null 2>&1 || true
fi

exec "$HERE/Testeiya/bin/launcher" "$@"
EOF
chmod +x "$APPDIR/AppRun"

cat > "$APPDIR/Testeiya.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Testeiya
Exec=AppRun
Icon=testeiya
StartupWMClass=Testeiya
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

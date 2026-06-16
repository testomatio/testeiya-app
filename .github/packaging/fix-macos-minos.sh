#!/usr/bin/env bash
# Fix electrobun 1.18.1's bogus macOS minimum-OS and rebuild the .dmg.
#
# electrobun's prebuilt darwin-arm64 core ships two Zig binaries
# (Contents/MacOS/libasar.dylib and zig-zstd) whose Mach-O LC_BUILD_VERSION
# declares minos = 14.8.3 — a macOS version that doesn't exist (Sonoma tops out
# at 14.7). dyld compares numerically, so on any macOS < 14.8 the app is refused
# with "You can't use this version of the application with this version of
# macOS." launcher links libasar.dylib, so the app won't even start.
#
# These are self-contained Zig binaries (an asar reader and zstd) that use no
# version-gated APIs, so rewriting minos down to 11.0 is safe. We patch the
# 4-byte minos field in place, ad-hoc re-sign the patched binaries (required on
# arm64), then rebuild the dmg from the corrected .app.
set -euo pipefail

DMG=artifacts/stable-macos-arm64-Testeiya.dmg
ZST=artifacts/stable-macos-arm64-Testeiya.app.tar.zst
WORK=macstage

rm -rf "$WORK"
mkdir -p "$WORK"

echo "Extracting app bundle ..."
zstd -dc "$ZST" | tar -x -C "$WORK"
APP="$WORK/Testeiya.app"
test -d "$APP"

echo "Patching minos (> 14.4 -> 11.0) on offending Mach-O ..."
python3 - "$APP" > "$WORK/patched.txt" <<'PY'
import struct, os, sys, glob
LC_BUILD_VERSION = 0x32
LC_VERSION_MIN_MACOSX = 0x24
NEW = (11 << 16)  # 11.0.0

def find_minos(d):
    magic = struct.unpack('<I', d[:4])[0]
    if magic == 0xfeedfacf:
        off = 32
    elif magic == 0xfeedface:
        off = 28
    else:
        return None, None
    ncmds = struct.unpack('<I', d[16:20])[0]
    p = off
    for _ in range(ncmds):
        if p + 8 > len(d):
            break
        cmd, sz = struct.unpack('<II', d[p:p + 8])
        if cmd == LC_BUILD_VERSION:
            return p + 12, struct.unpack('<I', d[p + 12:p + 16])[0]
        if cmd == LC_VERSION_MIN_MACOSX:
            return p + 8, struct.unpack('<I', d[p + 8:p + 12])[0]
        p += sz
    return None, None

def gt_14_4(v):
    return ((v >> 16) & 0xffff, (v >> 8) & 0xff) > (14, 4)

for f in glob.glob(sys.argv[1] + '/**/*', recursive=True):
    if not os.path.isfile(f) or os.path.islink(f):
        continue
    with open(f, 'rb') as fh:
        head = fh.read(65536)
    if len(head) < 8:
        continue
    pos, cur = find_minos(head)
    if pos is None or cur is None or not gt_14_4(cur):
        continue
    d = bytearray(open(f, 'rb').read())
    struct.pack_into('<I', d, pos, NEW)
    open(f, 'wb').write(d)
    print(f)
PY

if [ -s "$WORK/patched.txt" ]; then
  while IFS= read -r f; do
    echo "ad-hoc re-signing $f"
    codesign --force --sign - "$f"
  done < "$WORK/patched.txt"
else
  echo "WARNING: no offending binaries found to patch"
fi

echo "Verifying no Mach-O in the bundle still requires macOS > 14.4 ..."
python3 - "$APP" <<'PY'
import struct, os, sys, glob
LC_BUILD_VERSION = 0x32
LC_VERSION_MIN_MACOSX = 0x24

def find_minos(d):
    magic = struct.unpack('<I', d[:4])[0]
    if magic == 0xfeedfacf:
        off = 32
    elif magic == 0xfeedface:
        off = 28
    else:
        return None
    ncmds = struct.unpack('<I', d[16:20])[0]
    p = off
    for _ in range(ncmds):
        if p + 8 > len(d):
            break
        cmd, sz = struct.unpack('<II', d[p:p + 8])
        if cmd == LC_BUILD_VERSION:
            return struct.unpack('<I', d[p + 12:p + 16])[0]
        if cmd == LC_VERSION_MIN_MACOSX:
            return struct.unpack('<I', d[p + 8:p + 12])[0]
        p += sz
    return None

bad = []
for f in glob.glob(sys.argv[1] + '/**/*', recursive=True):
    if not os.path.isfile(f) or os.path.islink(f):
        continue
    with open(f, 'rb') as fh:
        head = fh.read(65536)
    if len(head) < 8:
        continue
    v = find_minos(head)
    if v is not None and ((v >> 16) & 0xffff, (v >> 8) & 0xff) > (14, 4):
        bad.append((f, v))
if bad:
    for f, v in bad:
        print(f"STILL TOO HIGH: {(v>>16)&0xffff}.{(v>>8)&0xff} {f}")
    sys.exit(1)
print("OK: no Mach-O requires macOS > 14.4")
PY

echo "Rebuilding dmg ..."
STAGE="$WORK/dmg"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
rm -f "$DMG"
hdiutil create -volname "Testeiya" -srcfolder "$STAGE" -ov -format UDZO "$DMG"

rm -rf "$WORK"
ls -la "$DMG"

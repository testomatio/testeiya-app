<!-- install-instructions -->
## Installing

> These desktop builds are **unsigned**, so each OS shows a one-time security warning on first launch. That is expected — follow the steps below.

### Linux (x64)
Download **`Testeiya-x86_64.AppImage`**, then make it executable and run it:
```bash
chmod +x Testeiya-x86_64.AppImage && ./Testeiya-x86_64.AppImage
```
If your system lacks FUSE (some minimal distros), run it without mounting instead:
```bash
./Testeiya-x86_64.AppImage --appimage-extract-and-run
```

### macOS (Apple Silicon)
1. Download **`stable-macos-arm64-Testeiya.dmg`**, open it, and drag **Testeiya** into **Applications**.
2. On first launch, right‑click **Testeiya** in Applications → **Open** → **Open**.
3. If macOS still blocks it ("damaged" / unidentified developer), clear the quarantine flag once:
   ```bash
   xattr -dr com.apple.quarantine /Applications/Testeiya.app
   ```

### Windows (x64)
1. Download **`stable-win-x64-Testeiya.zip`** and extract it (a short path such as `C:\Testeiya` avoids Windows path-length limits).
2. Run **`Testeiya\bin\launcher.exe`**.
3. If Microsoft Defender SmartScreen appears, click **More info → Run anyway**.

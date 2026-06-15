<!-- install-instructions -->
## Installing

> These desktop builds are **unsigned**, so each OS shows a one-time security warning on first launch. That is expected — follow the steps below.

### Windows (x64)
1. Download **`stable-win-x64-Testeiya-Setup.zip`** from the assets below and extract it.
2. Run **`Testeiya-Setup.exe`**.
3. If Microsoft Defender SmartScreen appears, click **More info → Run anyway**.

### macOS (Apple Silicon)
1. Download **`stable-macos-arm64-Testeiya.dmg`**, open it, and drag **Testeiya** into **Applications**.
2. On first launch, right‑click **Testeiya** in Applications → **Open** → **Open**.
3. If macOS still blocks it ("damaged" / unidentified developer), clear the quarantine flag once:
   ```bash
   xattr -dr com.apple.quarantine /Applications/Testeiya.app
   ```

### Linux (x64)
Download **`stable-linux-x64-Testeiya-Setup.tar.gz`**, then extract and install in one line:
```bash
tar -xzf stable-linux-x64-Testeiya-Setup.tar.gz && ./installer
```
This installs the app to `~/.local/share/` and adds a desktop shortcut / menu entry.

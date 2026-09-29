# Installing JFFJ Card Generator on Mac

## 1. Download

Get `JFFJ_Installer.dmg` from the latest successful build (GitHub Actions → the
`Build macOS app` workflow → the `JFFJ-macOS-dmg` artifact of the latest run).

## 2. Install

1. Double-click `JFFJ_Installer.dmg` to open it.
2. Drag **JFFJ.app** into the **Applications** shortcut in the same window.
3. Close the disk image window (you can eject the mounted image from Finder's sidebar).

## 3. First launch - "unidentified developer" warning

This app isn't signed with an Apple Developer certificate (that costs $99/year and
wasn't set up for this project), so **macOS Gatekeeper will block it the first time**
with a message like *"JFFJ.app cannot be opened because it is from an unidentified
developer."* This is expected - it's not a broken build. To open it anyway:

- **Right-click (or Control-click) JFFJ.app in Applications → Open → click "Open"** in
  the dialog that appears. This only needs to be done once - after that, it opens
  normally by double-clicking.
- If that doesn't show an "Open" option, go to **System Settings → Privacy & Security**,
  scroll down, and there'll be a line about JFFJ.app being blocked - click **"Open Anyway"**.

## 4. First run

The app seeds its own image library from the ~110 bundled sample images automatically -
no setup needed for that. It'll ask for permission the first time it touches certain
system-protected folders only if you use file pickers (Save PNG, Add images) - that's
normal macOS behavior for any app, just click Allow.

## 5. Email sending (optional)

Settings → App password. This is pre-filled to send from `Jacobruchotzke@gmail.com` with
the app password already baked in - just click **Test connection** to confirm it logs in.
If that fails with a certificate/SSL error (rare, but a known macOS Python quirk), tell
Claude the exact error text so it can be fixed in the build.

## 6. Watch folder (optional)

Settings → Watch folder → Browse, point it at a local folder (e.g. one synced by Google
Drive, Dropbox, or OneDrive for Mac). Anything dropped there gets added to the library
automatically.

## If something looks wrong

Report back exactly what happened - what you clicked, what message appeared (screenshot
if possible), and whether the app opened at all. The GitHub Actions build log and the
`JFFJ-app-bundle` artifact (uploaded even when the automated test fails) usually pinpoint
the problem without needing your Mac at all.

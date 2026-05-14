"""
Pre-extract winCodeSign-2.6.0 into electron-builder's cache.

Approach: invoke the bundled 7za.exe ourselves. It will fail to create the
darwin/*.dylib symlinks (Windows non-admin) and exit 2, but the real files
are extracted in full beforehand. We swallow exit 2 if the only error
mentions "symbolic link", because we don't need those macOS symlinks for
a Windows build.

Run once before `electron-builder --win nsis`.
"""
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

VERSION = "2.6.0"
ARCHIVE = f"winCodeSign-{VERSION}.7z"
URL = f"https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-{VERSION}/{ARCHIVE}"

ROOT = Path(__file__).resolve().parent.parent
SEVENZ = ROOT / "node_modules" / "7zip-bin" / "win" / "x64" / "7za.exe"

CACHE_ROOT = Path(os.environ["LOCALAPPDATA"]) / "electron-builder" / "Cache" / "winCodeSign"
TARGET_DIR = CACHE_ROOT / f"winCodeSign-{VERSION}"
ARCHIVE_PATH = CACHE_ROOT / ARCHIVE


def looks_complete(target: Path) -> bool:
    signtool = target / "windows-10" / "x64" / "signtool.exe"
    return signtool.exists() and signtool.stat().st_size > 100_000


def main() -> int:
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)

    if looks_complete(TARGET_DIR):
        print(f"[ok] cache already populated at {TARGET_DIR}")
        return 0

    if TARGET_DIR.exists():
        # Wipe partial extractions
        import shutil
        shutil.rmtree(TARGET_DIR, ignore_errors=True)

    if not ARCHIVE_PATH.exists():
        print(f"[download] {URL}")
        urllib.request.urlretrieve(URL, ARCHIVE_PATH)
        print(f"[download] saved {ARCHIVE_PATH.stat().st_size} bytes")
    else:
        print(f"[reuse] archive already at {ARCHIVE_PATH}")

    TARGET_DIR.mkdir(parents=True, exist_ok=True)

    print(f"[extract] using {SEVENZ}")
    print(f"[extract] {ARCHIVE_PATH} -> {TARGET_DIR}")
    proc = subprocess.run(
        [str(SEVENZ), "x", "-y", "-snld", str(ARCHIVE_PATH), f"-o{TARGET_DIR}"],
        capture_output=True,
        text=True,
    )
    print(proc.stdout[-2000:] if len(proc.stdout) > 2000 else proc.stdout)
    if proc.stderr.strip():
        print("--- stderr ---", file=sys.stderr)
        print(proc.stderr, file=sys.stderr)

    if proc.returncode == 0:
        pass
    elif proc.returncode == 2:
        # Tolerate exit 2 if the only errors are symlink-related
        non_symlink_errors = [
            l for l in (proc.stdout + "\n" + proc.stderr).splitlines()
            if "ERROR" in l
            and "symbolic link" not in l
            and "Sub items Errors" not in l
            and "Archives with Errors" not in l
        ]
        if non_symlink_errors:
            print(f"[fail] non-symlink errors: {non_symlink_errors}", file=sys.stderr)
            return 2
        print("[ok] tolerating exit code 2 (only symlink errors)")
    else:
        print(f"[fail] 7za exited with code {proc.returncode}", file=sys.stderr)
        return proc.returncode

    if not looks_complete(TARGET_DIR):
        signtool = TARGET_DIR / "windows-10" / "x64" / "signtool.exe"
        print(f"[fail] expected {signtool} but it is missing or empty", file=sys.stderr)
        return 3

    print(f"[ok] extracted; signtool.exe = {(TARGET_DIR / 'windows-10' / 'x64' / 'signtool.exe').stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())

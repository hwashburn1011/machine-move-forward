# Windows beta packaging

The release target is a portable Windows x86-64 ZIP with one root executable,
`MachineMoveForward.exe`, its external `MachineMoveForward.pck`, any export DLLs,
player instructions, credits, engine notices, build identity and checksums. No
installer, administrator access, Python, Blender or Godot installation is required
on the player's machine. This tooling does not publish or upload anything.

## Frozen inputs

The product owner creates and reviews `godot/export_presets.cfg`. The preset is
`Windows Desktop`, release, x86-64, external PCK, `all_resources`, include `*.json`,
exclude `tests/*,tools/*,assets/models/player.glb`. Do not exclude `.glb`, `.res`,
textures or imported resource caches broadly. Dynamic model IDs and collision
chunk paths are runtime dependencies even when a static reference search misses
them. The explicit legacy `player.glb` exclusion is safe because native playback
uses `art/refined-s07-player.scn`; the former is the unused Mixamo model recorded
in `ASSETS.md`.

The product owner also writes `godot/release/build.json`:

```json
{
  "schema": 1,
  "version": "0.3.0-beta.1",
  "build_id": "release-specific-id",
  "source_hash": "64 lowercase hex digits",
  "created_utc": "2026-10-02T12:00:00Z",
  "asset_manifest_sha256": "64 lowercase hex digits"
}
```

`release/` is outside the recorder's source-fingerprint directories, avoiding a
self-referential hash. The source hash matches the existing sorted path/newline/
file-SHA/newline algorithm over project.godot, scripts, data, scenes and shaders.
The asset-manifest digest is supplied by the product owner's frozen asset audit;
this packager does not invent a different definition for it. Extra identity keys
are retained. Complete any engine import before freezing: an export that changes
source-side import settings will fail the unchanged-input check.

## Explicit workflow

From the repository root, with Python available for release tooling:

```powershell
python tools/godot/package-windows.py inventory --out test-results/windows-beta/inventory.json
python tools/godot/package-windows.py export --inventory test-results/windows-beta/inventory.json --godot test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --out test-results/windows-beta/export
python tools/godot/package-windows.py audit --inventory test-results/windows-beta/inventory.json --godot test-results/godot-tools/Godot_v4.7.2-stable_win64_console.exe --pck test-results/windows-beta/export/MachineMoveForward.pck --out test-results/windows-beta/resource-audit
python tools/godot/package-windows.py package --inventory test-results/windows-beta/inventory.json --export-dir test-results/windows-beta/export --audit test-results/windows-beta/resource-audit/audit.json --out releases/windows-beta-0.3.0-beta.1
```

Every output must be new. Existing evidence is never deleted or overwritten.
`inventory` and `package` are offline. `export` is the only command invoking an
export; it never writes the project or preset. `audit` starts the matching engine
headlessly against the PCK from an otherwise empty working directory, with an
external helper and isolated user data. It does not instantiate the game.

The resource audit verifies all retained raw JSON bytes and parsing, all known
resources via `ResourceLoader.exists` (which follows `.gd` to `.gdc` remaps), all
dynamic baked collision shapes by loading and checking triangle data, the
production entry, excluded development paths, and the embedded build identity.
It collects the exact engine's license texts and copyright notices. No raw
`.gd`, `.tscn` or `project.godot` file is required to survive export.

The ZIP has sorted paths and identity-derived timestamps. Given the same exported
bytes, identity and audit, packaging is repeatable with the same Python/zlib
toolchain. This is **not** a promise that Godot produces bit-identical exports
across machines or engine versions. `CHECKSUMS.sha256` hashes every payload file
except itself; a separate `.zip.sha256` hashes the completed ZIP.

## Standalone smoke acceptance

A passing resource audit alone is not an installable-beta acceptance result.
After packaging, extract the actual ZIP to a new folder outside the repository.
Verify its checksums, then launch that extracted EXE with an unrelated working
directory and no `--path` pointing to the source. Redirect `APPDATA` and
`LOCALAPPDATA` for the child process to a dedicated test profile before launch;
never overwrite the developer's campaigns or settings. Preserve process logs,
release identity, artifact hashes and the isolated save directory as evidence.

Use the real title and New Game flow, not `--quick` or a replacement test
entry. Verify title prewarming, opening, walking/aiming/interactions, Settings
and music controls. Make and save campaign progress, exit normally, relaunch the
same extracted executable/profile, and check Continue and preference persistence.
Verify the build identifier of an opt-in local recording without source-file
I/O errors. Also exercise one furnishing, real salvage, and a visited site with
dynamic collision/roof resources. A private checkpoint-assisted asset sweep may
supplement this earned smoke, but must not be described as a normal campaign run.

Use a fresh profile and a **copied** existing valid campaign to test compatibility
separately. Record the graphics adapter/driver, renderer, startup time and any
diagnostics. Do not silently change renderers, suppress missing-resource errors,
or label a headless resource check a visual/performance pass.

The official Windows export templates disable external script overrides. The
automated smoke runner therefore boots the extracted release EXE normally, then
uses the matching Godot engine with that same unchanged extracted PCK for
instrumented New Game and Continue checks. It records these as separate
results, with a fresh isolated profile and the hashes of both binaries and the
pack. Instrumented checks are not evidence of interactive testing of the release
EXE. Review the resulting screenshots and complete a human playtest before a
public release; do not present resource or scripted checks as player feedback.

Run `run-windows-release-smoke.py --archive <ZIP> --out <new evidence directory>`
after packaging. Existing successful evidence in `test-results/windows-beta` is
specific to its recorded build identity. New runtime or asset changes require a
new inventory, export, audit, package and smoke result. The owner will set up the
itch.io account and project later; no upload destination is currently configured.

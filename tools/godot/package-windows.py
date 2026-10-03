"""Conservative Windows beta packaging. No project/preset edits or implicit exports.

Each command is explicit. `inventory` is offline; `audit` runs a headless PCK-only
resource inspection; `export` invokes an existing preset; `package` is offline.
No command uploads anything, deletes output, or launches an interactive game.
"""
from __future__ import annotations

import argparse
import configparser
import datetime as dt
import fnmatch
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[2]
PROJECT = ROOT / "godot"
EXE_NAME = "MachineMoveForward.exe"
PRESET = "Windows Desktop"
EXCLUDES = ("tests/*", "tools/*", "assets/models/player.glb")
RESOURCE_EXTENSIONS = {
    ".gd", ".gdshader", ".scn", ".tscn", ".tres", ".res", ".glb", ".gltf",
    ".png", ".jpg", ".jpeg", ".webp", ".svg", ".wav", ".ogg", ".mp3",
    ".ttf", ".otf", ".fnt", ".bmfont", ".material", ".mesh", ".anim",
}


def require(value, message):
    if not value:
        raise ValueError(message)


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")


def identity(project):
    value = read_json(project / "release/build.json")
    require(value.get("schema") == 1, "Release identity schema must be 1")
    for key in ("version", "build_id", "source_hash", "created_utc", "asset_manifest_sha256"):
        require(isinstance(value.get(key), str) and value[key].strip(), f"Missing release identity {key}")
    for key in ("source_hash", "asset_manifest_sha256"):
        require(re.fullmatch(r"[0-9a-f]{64}", value[key]), f"Invalid {key}")
    require(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,95}", value["version"]), "Version must be filename-safe")
    timestamp(value["created_utc"])
    return value


def timestamp(value):
    stamp = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    require(stamp.tzinfo is not None, "created_utc must have an explicit timezone")
    return stamp.astimezone(dt.timezone.utc)


def source_fingerprint(project):
    paths = [project / "project.godot"]
    for folder in ("scripts", "data", "scenes", "shaders"):
        paths.extend(p for p in (project / folder).rglob("*")
                     if p.is_file() and p.suffix in {".gd", ".json", ".tscn", ".gdshader"})
    rows = sorted(("res://" + p.relative_to(project).as_posix(), p) for p in paths)
    return hashlib.sha256("".join(f"{name}\n{sha(path)}\n" for name, path in rows).encode()).hexdigest()


def excluded(relative):
    return any(fnmatch.fnmatchcase(relative, pattern) for pattern in EXCLUDES)


def paths_from_manifest(project, relative, mode):
    value = read_json(project / relative)
    if mode == "scenery":
        return [c["path"] for model in value["models"].values() for c in model["chunks"]]
    return [site["path"] for site in value["sites"].values()]


def inventory(project):
    release = identity(project)
    require(source_fingerprint(project) == release["source_hash"], "Release source hash is stale; freeze and regenerate identity first")
    resources, raw, files = [], [], []
    # Deliberately keep the full resource set. Static dependency discovery alone
    # cannot prove safety for model IDs, furnishings or collision chunk paths.
    for path in sorted(project.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(project).as_posix()
        if any(part.startswith(".") for part in Path(relative).parts) or excluded(relative):
            continue
        require(not path.is_symlink(), f"Do not package symlinked input: {relative}")
        if path.suffix == ".json":
            read_json(path)
            raw.append(dict(path="res://" + relative, sha256=sha(path)))
        elif path.suffix.lower() in RESOURCE_EXTENSIONS:
            resources.append("res://" + relative)
        else:
            continue
        files.append(dict(path=relative, bytes=path.stat().st_size, sha256=sha(path)))
        import_path = path.with_name(path.name + ".import")
        if import_path.is_file():
            files.append(dict(path=import_path.relative_to(project).as_posix(),
                              bytes=import_path.stat().st_size, sha256=sha(import_path)))
    shapes = sorted(set(paths_from_manifest(project, "data/scenery-collision.json", "scenery") +
                        paths_from_manifest(project, "data/site-roofs.json", "roofs")))
    require(shapes and all(p in resources for p in shapes), "A dynamic collision shape is absent from the resource inventory")
    required = ["res://scenes/main.tscn", "res://art/nomad-native.scn", "res://art/refined-s07-player.scn"]
    required += [f"res://art/refined-{kind}.scn" for kind in ("raider", "scavenger", "warden", "revenant", "bastion", "sovereign")]
    require(all(p in resources for p in required), "Missing compiled production scene")
    return dict(schema=1, identity=release, policy="all_resources; raw *.json; exact exclusions only",
                exclude_filters=list(EXCLUDES), resources=resources, raw_json=raw,
                collision_shapes=shapes, production_scenes=required, files=sorted(files, key=lambda x: x["path"]))


def check_frozen(project, expected):
    require(inventory(project) == expected, "Project inputs changed since inventory; do not mix export and source revisions")


def fresh_directory(path):
    path = path.resolve()
    require(not path.exists(), f"Output already exists; choose a new directory: {path}")
    path.mkdir(parents=True)
    return path


def isolated_environment(directory):
    env = os.environ.copy()
    for key, subdir in (("APPDATA", "roaming"), ("LOCALAPPDATA", "local"), ("XDG_DATA_HOME", "xdg-data")):
        folder = directory / subdir
        folder.mkdir(parents=True, exist_ok=True)
        env[key] = str(folder)
    return env


def run_engine(command, cwd, log, timeout=900, env=None):
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    with log.open("w", encoding="utf-8") as output:
        process = subprocess.Popen([str(p) for p in command], cwd=cwd, env=env,
                                   stdout=output, stderr=subprocess.STDOUT, creationflags=flags)
        try:
            result = process.wait(timeout=timeout)
        except (subprocess.TimeoutExpired, KeyboardInterrupt):
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               creationflags=flags, timeout=15)
            else:
                process.kill()
            process.wait(timeout=15)
            raise
    output = log.read_text(encoding="utf-8", errors="replace")
    problems = [line for line in output.splitlines() if line.lstrip().startswith(("ERROR:", "SCRIPT ERROR:", "WARNING:"))]
    require(result == 0 and not problems, f"Engine run failed ({result}); inspect {log}: {problems[:6]}")


def audit(args):
    expected = read_json(args.inventory)
    check_frozen(args.project, expected)
    out = fresh_directory(args.out)
    helper = Path(__file__).with_name("windows-release-audit.gd")
    command = [args.godot.resolve(), "--headless", "--path", out, "--main-pack", args.pck.resolve(),
               "--script", helper.resolve(), "--log-file", out / "engine.log", "--",
               f"--inventory={args.inventory.resolve()}", f"--output={out / 'audit.json'}", f"--pck={args.pck.resolve()}"]
    write_json(out / "command.json", dict(command=[str(p) for p in command], cwd=str(out),
                                         helper_sha256=sha(helper), isolated_user_data=True))
    run_engine(command, out, out / "process.log", env=isolated_environment(out / "user-data"))
    report = read_json(out / "audit.json")
    require(report.get("passed") and report.get("compiled_script_aware"), "PCK resource audit failed")
    require(report["pck_sha256"] == sha(args.pck), "PCK changed during audit")
    check_frozen(args.project, expected)
    print(out / "audit.json")


def export(args):
    expected = read_json(args.inventory)
    check_frozen(args.project, expected)
    require((args.project / "export_presets.cfg").is_file(), "Root must create/review export_presets.cfg before export")
    preset_path = args.project / "export_presets.cfg"
    validate_preset(preset_path, args.preset)
    preset_hash = sha(preset_path)
    out = fresh_directory(args.out)
    command = [args.godot.resolve(), "--headless", "--path", args.project.resolve(),
               "--log-file", out / "export-engine.log", "--export-release", args.preset, out / EXE_NAME]
    write_json(out / "export-command.json", dict(command=[str(p) for p in command], source_hash=expected["identity"]["source_hash"],
                                                 preset_sha256=preset_hash, engine_sha256=sha(args.godot)))
    run_engine(command, out, out / "export-process.log", timeout=1800)
    require((out / EXE_NAME).is_file() and (out / Path(EXE_NAME).with_suffix(".pck")).is_file(), "Expected standalone EXE and external PCK")
    check_frozen(args.project, expected)
    require(sha(preset_path) == preset_hash, "Export preset changed during export")
    print(out)


def validate_preset(path, name):
    config = configparser.ConfigParser(interpolation=None)
    config.read(path, encoding="utf-8-sig")
    candidates = [s for s in config.sections() if not s.endswith(".options") and config[s].get("name", "").strip('"') == name]
    require(len(candidates) == 1, "Expected exactly one named Windows export preset")
    base = config[candidates[0]]
    options = config[candidates[0] + ".options"]
    require(base.get("platform", "").strip('"') == "Windows Desktop", "Preset must target Windows Desktop")
    require(base.get("export_filter", "").strip('"') == "all_resources", "Dynamic assets require all_resources export")
    includes = {s.strip() for s in base.get("include_filter", "").strip('"').split(",")}
    excludes = {s.strip() for s in base.get("exclude_filter", "").strip('"').split(",")}
    require("*.json" in includes, "Raw JSON must be explicitly retained")
    require(excludes == set(EXCLUDES), "Export exclusions differ from reviewed conservative policy")
    require(options.get("binary_format/embed_pck", "true") == "false", "The beta requires an external PCK")
    require(options.get("binary_format/architecture", "").strip('"') == "x86_64", "The beta requires x86_64")
    require(options.get("debug/export_console_wrapper", "0") == "0", "Console launcher must not add a second executable")


def release_files(directory):
    result = []
    for path in sorted(directory.rglob("*")):
        if not path.is_file():
            continue
        require(not path.is_symlink(), f"Symlinks are not release payloads: {path}")
        relative = path.relative_to(directory).as_posix()
        if relative in {"export-command.json", "export-engine.log", "export-process.log"}:
            continue
        require(path.suffix.lower() in {".exe", ".pck", ".dll"}, f"Unexpected export file requires review: {relative}")
        result.append(path)
    executables = [p for p in result if p.suffix.lower() == ".exe"]
    require(executables == [directory / EXE_NAME], "Exactly one top-level MachineMoveForward.exe is required; exclude console/debug launchers")
    require([p for p in result if p.suffix.lower() == ".pck"] == [directory / "MachineMoveForward.pck"], "Exactly one same-stem external PCK is required")
    return result


def notices(package, report):
    licenses = report["licenses"]
    require("Permission is hereby granted" in licenses["godot"], "Missing full Godot MIT text")
    require(isinstance(licenses["third_party"], dict) and licenses["third_party"], "Missing bundled third-party license texts")
    require(licenses["copyright"], "Missing engine dependency copyright notices")
    folder = package / "LICENSES"
    folder.mkdir()
    (folder / "Godot-MIT.txt").write_text(licenses["godot"] + "\n", encoding="utf-8")
    write_json(folder / "Godot-third-party.json", licenses)
    sections = ["Godot " + str(report["engine"].get("string", "4.7.2")) + " bundled dependency notices\n"]
    # Keep the exact structured engine output too, so nested notices lose no data.
    for component in licenses["copyright"]:
        sections.append(json.dumps(component, indent=2, ensure_ascii=False))
    for name, text in sorted(licenses["third_party"].items()):
        sections.append("\n" + name + "\n" + "=" * len(name) + "\n" + str(text))
    (folder / "Godot-third-party.txt").write_text("\n\n".join(sections) + "\n", encoding="utf-8")
    shutil.copyfile(PROJECT / "assets/fonts/marck-script/OFL.txt", folder / "MarckScript-OFL.txt")
    (package / "CREDITS.txt").write_text(
        "MACHINE MOVE FORWARD\n\n"
        "Game code, original artwork, original music and sound design were produced for this project.\n"
        "The original score and authored sound effects use no external music or sound samples.\n"
        "Opening pursuer dialogue: local Microsoft David Desktop speech synthesis,\n"
        "filtered and mixed for this project. No speech engine or voice model is bundled.\n"
        "Third-party components retain their respective licenses.\n\n"
        "ENGINE\nGodot Engine 4.7.2. Full MIT and bundled dependency notices are in LICENSES/.\n"
        "https://godotengine.org/license/\n\n"
        "CC0 TEXTURES\nPoly Haven: green_metal_rust, rusty_painted_metal, metal_plate, metal_plate_02, aerial_sand.\n"
        "https://polyhaven.com/\nhttps://creativecommons.org/publicdomain/zero/1.0/\n\n"
        "RETAINED CC0 MODEL PACKS\n"
        "Quaternius / Tomas Laulhe: RobotExpressive (conversion by Don McCurdy), Shipping Container Structure,\n"
        "Debris Pile, Assault Rifle and Shotgun. https://quaternius.com/ https://donmccurdy.com/\n"
        "Kenney: Ship Wreck. https://kenney.nl/\n"
        "These legacy packs are conservatively retained; current principal characters and equipment are original.\n\n"
        "LETTER FONT\nMarck Script, copyright 2011 Denis Masharov and Marck Fogel.\n"
        "Bundled unmodified under SIL Open Font License 1.1; see LICENSES/MarckScript-OFL.txt.\n"
        "https://github.com/google/fonts/tree/main/ofl/marckscript\n\n"
        "Other UI fonts use system fallbacks; no Windows font files are redistributed.\n"
        "The unused legacy Mixamo Soldier/Vanguard file is excluded from this beta.\n",
        encoding="utf-8")


def player_readme(package, release):
    (package / "README.txt").write_text(
        f"MACHINE MOVE FORWARD — {release['version']}\nBuild: {release['build_id']}\n\n"
        "WINDOWS BETA\nExtract the entire ZIP, then run MachineMoveForward.exe. Keep the EXE, PCK,\n"
        "and any shipped DLLs together. Godot, Python and Blender do not need to be installed.\n"
        "This build uses the Forward+ renderer and needs a Vulkan-capable graphics driver.\n\n"
        "START\nChoose New Game from the title screen. The opening and local terminal guide\n"
        "introduce your machine. Settings contains the complete controls and separate sound/music levels.\n\n"
        "DEFAULT CONTROLS\nWASD move; mouse look; Shift sprint; Space jump; Ctrl or C crouch.\n"
        "E interact; left mouse fire; right mouse aim; R reload; 1/2 weapons; 3 salvage cutter.\n"
        "F salvage hook; B construction; G build catalogue; Tab terminal; Escape pause/cancel.\n"
        "Controls can be changed in Settings.\n\n"
        "SAVES AND SETTINGS\nSaves and preferences are stored in your Windows user profile, outside this folder.\n"
        "Use OPEN SAVE FOLDER in the campaign library to locate them. Keep a backup before testing\n"
        "an existing campaign with a new beta. Removing this game folder does not delete your saves.\n\n"
        "FEEDBACK\nWhen reporting an issue, include the version/build above, what you were doing,\n"
        "and whether it repeats after restarting. Local playtest recording is optional and is not uploaded automatically.\n"
        "CREDITS.txt and LICENSES/ describe bundled third-party components.\n",
        encoding="utf-8")


def deterministic_zip(source, output, created_utc):
    stamp = timestamp(created_utc)
    year = min(max(stamp.year, 1980), 2107)
    date = (year, stamp.month, stamp.day, stamp.hour, stamp.minute, stamp.second - stamp.second % 2)
    with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
        for path in sorted(p for p in source.rglob("*") if p.is_file()):
            info = zipfile.ZipInfo(path.relative_to(source).as_posix(), date_time=date)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            with path.open("rb") as inp, archive.open(info, "w", force_zip64=True) as target:
                shutil.copyfileobj(inp, target, length=1024 * 1024)


def package(args):
    expected, report = read_json(args.inventory), read_json(args.audit)
    check_frozen(args.project, expected)
    require(report.get("passed") is True and report.get("compiled_script_aware") is True, "A passing compiled-aware PCK audit is required")
    require(report["inventory_sha256"] == sha(args.inventory), "Audit belongs to a different inventory")
    require(report["identity"] == expected["identity"], "Audit release identity mismatch")
    files = release_files(args.export_dir)
    pck = args.export_dir / "MachineMoveForward.pck"
    require(report["pck_sha256"] == sha(pck), "PCK changed after its resource audit")
    out = fresh_directory(args.out)
    payload = out / "package"
    payload.mkdir()
    for path in files:
        target = payload / path.relative_to(args.export_dir)
        target.parent.mkdir(parents=True, exist_ok=True)
        # Immutable staging on the same volume need not duplicate the large PCK.
        # A different output volume still gets a normal independent copy.
        try:
            os.link(path, target)
        except OSError:
            shutil.copyfile(path, target)
        require(sha(path) == sha(target), "Export changed during copying")
    notices(payload, report)
    release = expected["identity"]
    player_readme(payload, release)
    payload_files = {p.relative_to(payload).as_posix(): dict(bytes=p.stat().st_size, sha256=sha(p))
                     for p in sorted(payload.rglob("*")) if p.is_file()}
    write_json(payload / "BUILD.json", dict(schema=1, identity=release, platform="windows-x86_64",
                pck_audit_sha256=sha(args.audit), inventory_sha256=sha(args.inventory),
                files=payload_files, verification="Resource coverage only; see separate standalone smoke evidence"))
    checksums = [f"{sha(p)}  {p.relative_to(payload).as_posix()}" for p in sorted(payload.rglob("*")) if p.is_file()]
    (payload / "CHECKSUMS.sha256").write_text("\n".join(checksums) + "\n", encoding="utf-8")
    archive = out / f"MachineMoveForward-{release['version']}-windows-x86_64.zip"
    deterministic_zip(payload, archive, release["created_utc"])
    with zipfile.ZipFile(archive) as zipped:
        require(zipped.testzip() is None, "ZIP integrity check failed")
        require([n for n in zipped.namelist() if n.lower().endswith(".exe")] == [EXE_NAME], "ZIP must contain one executable at its root")
        for row in checksums:
            digest, name = row.split("  ", 1)
            with zipped.open(name) as stream:
                found = hashlib.file_digest(stream, "sha256").hexdigest()
            require(found == digest, f"ZIP payload checksum mismatch: {name}")
    (out / (archive.name + ".sha256")).write_text(f"{sha(archive)}  {archive.name}\n", encoding="utf-8")
    check_frozen(args.project, expected)
    print(archive)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, default=PROJECT)
    sub = parser.add_subparsers(dest="command", required=True)
    inv = sub.add_parser("inventory", help="Offline: freeze all resource/raw JSON coverage")
    inv.add_argument("--out", type=Path, required=True)
    for name in ("audit", "export", "package"):
        command = sub.add_parser(name)
        command.add_argument("--inventory", type=Path, required=True)
        command.add_argument("--out", type=Path, required=True)
        if name in ("audit", "export"):
            command.add_argument("--godot", type=Path, required=True)
        if name == "audit":
            command.add_argument("--pck", type=Path, required=True)
        elif name == "export":
            command.add_argument("--preset", default=PRESET)
        else:
            command.add_argument("--export-dir", type=Path, required=True)
            command.add_argument("--audit", type=Path, required=True)
    args = parser.parse_args()
    args.project = args.project.resolve()
    try:
        if args.command == "inventory":
            require(not args.out.exists(), "Inventory output already exists")
            value = inventory(args.project)
            args.out.parent.mkdir(parents=True, exist_ok=True)
            write_json(args.out, value)
            print(args.out)
        else:
            globals()[args.command](args)
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        print(f"RELEASE BLOCKED: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

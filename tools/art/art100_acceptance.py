"""Summarize the frozen Art100 validation evidence without modifying it."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[2]


def read(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


catalog = read("assets/art100/catalog.json")
gallery = read("assets/art100/gallery-audit.json")
suites = read("test-results/narrative-regressions/summary.json")
assert len(suites) == 20
source_hashes = set()
for suite in suites:
    path = f"test-results/narrative-regressions/{suite['suite']}-output.txt"
    log = (ROOT / path).read_text(encoding="utf-8")
    # Three compact art suites print a count instead of one line per check.
    counts = re.findall(r"^[A-Z0-9_]+ (\d+) checks", log, re.M)
    suite["checks"] = max([suite["checks"]] + [int(n) for n in counts])
    suite["output"] = path
    suite["diagnostics"] = [line for line in log.splitlines() if line.startswith(("ERROR:", "SCRIPT ERROR:", "WARNING:"))]
    assert suite["exit_code"] == 0 and not suite["failures"] and not suite["diagnostics"], suite
    assert suite["checks"] > 0 and suite["source_hash"] == suite["source_hash_end"]
    source_hashes.add(suite["source_hash"])
assert len(source_hashes) == 1
project = ROOT / "godot"
runtime_paths = [project / "project.godot"]
for folder in ["scripts", "data", "scenes", "shaders"]:
    runtime_paths.extend(path for path in (project / folder).rglob("*") if path.is_file() and path.suffix in {".gd", ".json", ".tscn", ".gdshader"})
runtime_files = sorted(("res://" + path.relative_to(project).as_posix(), path) for path in runtime_paths)
runtime_payload = "".join(name + "\n" + hashlib.sha256(path.read_bytes()).hexdigest() + "\n" for name, path in runtime_files)
assert hashlib.sha256(runtime_payload.encode("utf-8")).hexdigest() in source_hashes

packages = []
for name in ["legacy", "wasteland", "machine", "story-robots"]:
    path = f"godot/art/art100-{name}.glb"
    data = (ROOT / path).read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    assert sha == gallery["runtime_sha256"][name]
    validation = read(f"assets/art100/{name}/validation.json")
    gltf = validation.get("gltf", validation)
    issues = gltf.get("issues", gltf)
    errors = issues.get("numErrors", validation.get("errors", 0))
    warnings = issues.get("numWarnings", validation.get("warnings", 0))
    assert errors == 0 and warnings == 0 and not validation.get("failures", []) and not validation.get("validation_errors", [])
    packages.append(dict(path=path, sha256=sha, bytes=len(data),
        exported_triangles=validation.get("triangles", validation.get("total_triangles")),
        gltf_errors=errors, gltf_warnings=warnings,
        validation=f"assets/art100/{name}/validation.json"))

assert catalog["count"] == 100 and catalog["new"] == 59 and catalog["refined"] == 41
assert len({model["id"] for model in catalog["models"]}) == 100
native = read("test-results/art100/native-review.json")
assert native["furnishingsPlaced"] == 6 and len(native["routes"]) == 3
report = {
    "iteration": "Art 100",
    "generated_utc": datetime.now(timezone.utc).isoformat(),
    "passed": True,
    "models": {"total": 100, "new": 59, "refined": 41, "collections": gallery["cohorts"],
        "counting": catalog["counting"], "catalog": "assets/art100/catalog.json"},
    "runtime_source_sha256": next(iter(source_hashes)),
    "suites_passed": len(suites),
    "checks_passed": sum(suite["checks"] for suite in suites),
    "failures": [],
    "suites": suites,
    "runtime_packages": packages,
    "total_package_bytes": sum(package["bytes"] for package in packages),
    "total_exported_package_triangles": sum(package["exported_triangles"] for package in packages),
    "geometry_accounting": "Package geometry includes six authored robot attachments; their pre-existing complete body geometry is retained separately and included in the complete-character review gallery.",
    "native_render_review": native,
    "character_pose_review": "assets/art100/story-robots/native-validation-gpu.json",
    "gallery": {"path": "assets/art100/Art100Review.blend", "audit": "assets/art100/gallery-audit.json", "opened_in_connected_blender": True,
        "previous_session_copy": "assets/art100/MCP-session-before-Art100.blend"},
    "catalog_validation": read("test-results/art100/catalog-validation.json"),
    "scope": ["Native Godot art and physical-quality iteration.", "25 furnishings are cosmetic build pieces.",
        "Six existing characters are art refinements with preserved AI and animation roles.",
        "Story fixtures preserve the existing campaign and finale state.",
        "Desert scenery remains outside supported radioactive-ground traversal.",
        "Static-camera performance samples are not a complete gameplay benchmark.",
        "Full V1 beta acceptance remains a separate milestone."]
}
destination = ROOT / "docs/godot-port/results/art100-2026-10-01.json"
destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
(ROOT / "test-results/art100/regressions-final.json").write_text(json.dumps(suites, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"report": str(destination), "models": 100, "suites": len(suites), "checks": report["checks_passed"], "passed": True}))

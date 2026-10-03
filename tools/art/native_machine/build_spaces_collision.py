"""Derive the sparse machine collision recipe without rewriting any source faces.

Run with ordinary Python + numpy; Blender and Godot are not required. Existing
pump/bench/intake trims remain intact. Exact connected source components protect
the retained cabinet where its bounds overlap the removed cargo-locker envelope.
"""
import hashlib
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]


def read(relative):
    return json.loads((ROOT / relative).read_text(encoding="utf-8-sig"))


def sha_json(value):
    return hashlib.sha256(json.dumps(value, separators=(",", ":")).encode()).hexdigest()


def source_box(site, switchgear):
    x, y, z = site["position"]
    family = site["family"]
    if family == "locker":
        return ([x-.565, y-.03, z-.54], [x+.565, y+.90, z+.54])
    if family == "drum":
        return ([x-.31, y-.015, z-.33], [x+.31, y+.895, z+.33])
    if family == "vessel":
        return ([x-.40, 12.425, 9.91], [x+.32, 14.59, 10.85])
    if family == "switchgear":
        i = next(i for i, s in enumerate(switchgear["sites"]) if s["name"] == site["name"])
        box = switchgear["originalBoxes"][i]
        return (np.array(box["min"])-.003, np.array(box["max"])+.003)
    return None  # Pumps and benches already have separate replacement bodies.


def ranges(mask):
    padded = np.concatenate(([False], mask, [False])).astype(np.int8)
    edges = np.flatnonzero(np.diff(padded))
    return [[int(a)*3, int(b)*3] for a, b in zip(edges[::2], edges[1::2])]


def main():
    layout = read("godot/data/machine-spaces.json")
    previous = read("godot/art/nomad-intake-collision.json")
    raw = read("godot/data/runtime.json")["colliders"][previous["sourceCollider"]]
    assert len(raw["indices"]) == previous["sourceIndexCount"]
    assert sha_json(raw) == previous["sourceSha256"], "Frozen collision source changed"
    switchgear = read("godot/art/nomad-switchgear.json")
    points = np.array(raw["vertices"]).reshape(-1, 3)
    triangles = points[np.array(raw["indices"]).reshape(-1, 3)]
    removed_sites = [s for s in layout["staticRemoved"] if source_box(s, switchgear)]
    selected = np.zeros(triangles.shape[:2], dtype=bool)
    for site in removed_sites:
        lo, hi = source_box(site, switchgear)
        selected |= ((triangles > lo) & (triangles < hi)).all(axis=2)

    # Partition complete source components by exact, welded vertex coordinates.
    # The frozen exporter duplicates vertices at material/normal seams; source
    # coordinates are used as keys so seam duplicates still join exactly.
    parent = np.arange(len(triangles))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = int(parent[i])
        return i

    by_point = {}
    for i, tri in enumerate(triangles):
        for p in tri:
            key = tuple(p)
            if key in by_point:
                a, b = find(i), find(by_point[key])
                if a != b:
                    parent[a] = b
            else:
                by_point[key] = i
    groups = {}
    for i in range(len(triangles)):
        groups.setdefault(find(i), []).append(i)

    protected = np.zeros(len(triangles), dtype=bool)
    protected_report = []
    for site in layout["staticRetained"]:
        box = source_box(site, switchgear)
        if box is None:
            continue
        lo, hi = box
        within = ((triangles > lo) & (triangles < hi)).all(axis=(1, 2))
        count = 0
        for group in groups.values():
            if within[group].all():
                protected[group] = True
                count += len(group)
        protected_report.append({"name": site["name"], "triangles": count})

    remove = selected.all(axis=1) & ~protected
    partial = selected.any(axis=1) & ~selected.all(axis=1) & ~protected
    assert not partial.any(), f"Removal cuts {int(partial.sum())} source triangles"
    # Selected faces must contain each connected part in its entirety.
    removed_components = []
    for group in groups.values():
        if remove[group].any():
            assert remove[group].all(), "Removal cuts a connected component"
            p = triangles[group]
            removed_components.append({"triangles": len(group), "sourceTriangleMin": min(group),
                                       "sourceTriangleMax": max(group),
                                       "min": p.min(axis=(0, 1)).tolist(), "max": p.max(axis=(0, 1)).tolist()})
    prior_keep = np.zeros(len(triangles), dtype=bool)
    for a, b in previous["retainedIndexRanges"]:
        prior_keep[a//3:b//3] = True
    assert not (remove & ~prior_keep).any(), "A new trim unexpectedly overlaps a previous trim"
    keep = prior_keep & ~remove
    assert not (protected & prior_keep & ~keep).any(), "A retained assembly lost collision"
    assert len(layout["staticRetained"]) == 10 and len(layout["staticRemoved"]) == 14
    result = dict(previous)
    result.update({"retainedIndexRanges": ranges(keep), "removedStaticIndexRanges": ranges(remove),
                   "removedStaticTriangles": int(remove.sum()), "retainedTriangles": int(keep.sum()),
                   "priorRecipe": "res://art/nomad-intake-collision.json",
                   "priorRecipeSha256": hashlib.sha256((ROOT/"godot/art/nomad-intake-collision.json").read_bytes()).hexdigest(),
                   "staticCompositionSha256": sha_json({k: layout[k] for k in ["staticRetained", "staticRemoved"]}),
                   "removedStaticNames": [s["name"] for s in removed_sites],
                   "protectedStatic": protected_report, "removedComponents": removed_components,
                   "partialTriangles": 0, "partialComponents": 0,
                   "retainedSourceFacesSha256": hashlib.sha256(triangles[keep].astype("<f8").tobytes()).hexdigest()})
    output = ROOT / "godot/art/nomad-spaces-collision.json"
    output.write_text(json.dumps(result, indent=2)+"\n", encoding="utf-8")
    print(json.dumps({"removedTriangles": int(remove.sum()), "retainedTriangles": int(keep.sum()),
                      "wholeComponentsRemoved": len(removed_components), "protected": protected_report,
                      "partialTriangles": 0, "partialComponents": 0}))


if __name__ == "__main__":
    main()

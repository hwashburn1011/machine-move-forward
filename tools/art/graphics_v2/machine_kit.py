"""Build the staged machine and station detail kits for graphics-v2.

Run from the repository root with the isolated Blender 5.1 executable:
  blender --background --factory-startup --python tools/art/graphics_v2/machine_kit.py

The script imports the read-only hard-surface helpers for materials, packed
maps, UVs, smoothing and GLB export. It never opens or edits the live Blender
session; each asset is generated in a fresh background process and saved into
the staging/source directories owned by this graphics packet.
"""
import json
import math
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[3]
STAGE = ROOT / "assets" / "graphics-v2" / "staging"
SOURCE = ROOT / "assets" / "blender" / "graphics-v2"
STAGE.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(Path(__file__).resolve().parent))
import hardsurface as hs  # noqa: E402  (Blender loads bpy before this import)


def machine_materials():
    return hs.setup_mats("MachineKit_", [
        ("Paint", "657669", .48, .64, False, 0),
        ("Dark", "252f32", .62, .56, False, 0),
        ("Steel", "9aa4a3", .84, .34, False, 0),
        ("Rubber", "1c2223", .08, .91, False, 0),
        ("Hazard", "d18a39", .25, .54, False, 0),
        ("Lamp", "ffb34f", .08, .25, True, 2.4),
    ])


def station_materials():
    return hs.setup_mats("StationKit_", [
        ("Paint", "62756e", .45, .66, False, 0),
        ("Dark", "273235", .64, .57, False, 0),
        ("Steel", "a0aaa5", .84, .32, False, 0),
        ("Rubber", "1c2223", .08, .91, False, 0),
        ("Glass", "8fb9b8", .08, .14, True, 0),
        ("Lamp", "ffb34f", .08, .25, True, 2.4),
        ("Accent", "d18a39", .22, .48, False, 0),
    ])


def machine_kit():
    m = machine_materials()
    root = hs.empty("MMF_MachineDetailKit")
    root["assetRole"] = "visual-only-machine-kit"
    root["deckWidth"] = 10.0
    root["deckLength"] = 16.0
    root["colliderContract"] = "runtime-MachineGeometry"

    # Structural frame under the 10 x 16 m deck.
    for z in (-6.2, -3.1, 0.0, 3.1, 6.2):
        hs.box("Welded cross beam", (0, 1.15, z), (10.25, .24, .22), m["Dark"], root, .035)
    for x in (-4.35, 4.35):
        hs.box("Longitudinal beam", (x, 1.32, 0), (.22, .30, 14.8), m["Dark"], root, .035)

    # Replace the broad blank fore bulkhead with bolted service panels. These
    # sit against the existing hull shell at Z=-7.8 and add no walkable volume.
    for x in (-3.6, -1.8, 0, 1.8, 3.6):
        hs.box('Bulkhead panel gasket',(x,2.04,-7.82),(1.72,2.14,.035),m['Dark'],root,.025)
        hs.box('Pressed bulkhead panel',(x,2.04,-7.855),(1.64,2.06,.045),m['Paint'],root,.05)
        for dx in (-.70,.70):
            for y in (1.16,2.92):
                hs.cyl('Bulkhead captive bolt',(x+dx,y,-7.88),(x+dx,y,-7.904),.034,m['Steel'],root,12)
        for y in (2.37,2.51,2.65):
            hs.box('Bulkhead louver',(x,y,-7.89),(1.15,.048,.025),m['Dark'],root,.007)
    # Engine-front cooling grille and access fasteners; the engine's runtime
    # block starts at Z=4.7. Keep the service corridor clear.
    hs.box('Engine radiator frame',(0,4.64,4.66),(2.18,1.14,.055),m['Steel'],root,.045)
    hs.box('Engine radiator recess',(0,4.64,4.62),(2.02,.98,.035),m['Dark'],root,.018)
    for x in (-.81,-.54,-.27,0,.27,.54,.81):
        hs.box('Radiator cooling fin',(x,4.64,4.59),(.055,.87,.045),m['Steel'],root,.007)
    for x in (-1.0,1.0):
        for y in (4.15,5.13):
            hs.cyl('Radiator fastener',(x,y,4.59),(x,y,4.57),.025,m['Steel'],root,12)

    # Wheel hubs and bearing races, kept inside the existing sponson envelope.
    for x in (-5.45, 5.45):
        for z in (-5.35, 0.0, 5.35):
            side = -1 if x < 0 else 1
            hs.cyl("Bearing housing", (x-side*.28, 1.55, z), (x+side*.28, 1.55, z), .46, m["Steel"], root, 24, .008)
            hs.torus("Bearing race", (x+side*.31, 1.55, z), .37, .055, m["Steel"], root, "x", 24, 8)
            hs.torus("Hub seal", (x+side*.34, 1.55, z), .23, .045, m["Rubber"], root, "x", 24, 8)
            hs.cyl("Suspension ram", (x, 1.76, z), (x, 2.82, z+side*.16), .11, m["Steel"], root, 16, .004)
            hs.cyl("Piston rod", (x, 2.35, z+side*.08), (x, 2.98, z+side*.17), .045, m["Steel"], root, 12, .003)

    # Repeated tread lugs are grouped by the exporter and remain a silhouette
    # cue at a distance instead of a heavy continuous rubber mesh.
    for x in (-5.28, 5.28):
        for i in range(9):
            z = -6.6 + i * 1.65
            lug = hs.box("Tread lug", (x, 1.46, z), (.24, .16, .55), m["Rubber"], root, .025)
            lug.rotation_euler[1] = (-.10 if x < 0 else .10)

    # Formed service hatches, seam bars and a restrained set of fasteners.
    for x, z in ((1.9, -1.9), (1.9, 1.9), (-1.9, 4.9)):
        hs.box("Service hatch", (x, 3.73, z), (1.25, .06, .86), m["Steel"], root, .04)
        for sx in (-.48, .48):
            for sz in (-.30, .30):
                hs.screw("Hatch bolt", (x+sx, 3.78, z+sz), m["Steel"], root, .035)

    # Curved pipes and clamp rings make the aft machinery read as connected.
    for side in (-1, 1):
        x = side * 1.35
        hs.curve("Formed coolant pipe", [(x, 5.35, 5.8), (x*1.05, 5.95, 5.2), (side*2.25, 5.95, 4.5)], .07, m["Steel"], root)
        for z in (5.35, 4.95):
            hs.torus("Hose clamp", (x, 5.63, z), .09, .018, m["Steel"], root, "z", 20, 6)

    for z in (-6.9, 6.9):
        hs.box("Hazard service tab", (0, 3.73, z), (2.4, .05, .12), m["Hazard"], root, .015)

    hs.join_static()
    hs.uv_all()
    return root


def gauge(m, name, at, radius=.16, parent=None):
    hs.torus(name + " bezel", at, radius, .024, m["Steel"], parent, "z", 24, 8)
    hs.box(name + " glass", (at[0], at[1], at[2]-.012), (radius*1.62, radius*1.62, .012), m["Glass"], parent, .008)
    hs.box(name + " pointer", (at[0], at[1], at[2]-.022), (.012, radius*.70, .008), m["Accent"], parent, .002)


def station_kit():
    m = station_materials()
    # Generator module, 1.6m footprint, under 15k triangles after export.
    generator = hs.empty("MMF_GeneratorDetail")
    generator["pieceId"] = "generator"
    hs.box("Generator shell", (0, .60, 0), (1.6, 1.15, 1.36), m["Paint"], generator, .07)
    hs.box("Generator base", (0, .10, 0), (1.68, .16, 1.5), m["Dark"], generator, .035)
    for x in (-.32, -.16, 0, .16, .32):
        hs.box("Cooling fin", (x, .72, -.62), (.07, .54, .10), m["Steel"], generator, .018)
    hs.curve("Fuel line", [(-.5, .52, .52), (-.8, .72, .72), (-.8, 1.34, .72)], .045, m["Steel"], generator)
    gauge(m, "Generator gauge", (.22, .72, .70), .13, generator)
    hs.box("Access panel", (-.2, .86, .705), (.48, .035, .08), m["Dark"], generator, .01)
    hs.box("Status lamp", (-.2, .98, .715), (.08, .06, .025), m["Lamp"], generator, .008)

    # Refinery module, a rounded vessel, upper transfer pipe and analog gauge.
    refinery = hs.empty("MMF_RefineryDetail")
    refinery["pieceId"] = "refinery"
    hs.cyl("Refinery vessel", (0, .24, 0), (0, 2.20, 0), .66, m["Paint"], refinery, 32, .03)
    for y in (.45, 1.10, 1.75):
        hs.torus("Vessel band", (0, y, 0), .67, .035, m["Steel"], refinery, "y", 28, 8)
    hs.curve("Transfer pipe", [(.52, 1.95, .35), (.83, 2.25, .28), (.83, 2.65, .15)], .055, m["Steel"], refinery)
    hs.cyl("Top cap", (0, 2.28, 0), (0, 2.40, 0), .20, m["Steel"], refinery, 20, .01)
    gauge(m, "Refinery gauge", (.32, 1.38, .68), .14, refinery)
    hs.box("Refinery access panel", (-.28, 1.55, .68), (.30, .42, .035), m["Dark"], refinery, .015)

    # Workbench module with drawers, a vice, tool rack and three distinct tools.
    bench = hs.empty("MMF_WorkbenchDetail")
    bench["pieceId"] = "workbench"
    hs.box("Bench top", (0, .95, 0), (1.8, .14, .9), m["Paint"], bench, .04)
    for x in (-.48, .48):
        hs.box("Drawer", (x, .66, -.47), (.62, .24, .045), m["Dark"], bench, .015)
        hs.box("Drawer pull", (x, .66, -.50), (.17, .035, .05), m["Steel"], bench, .01)
    hs.box("Vise body", (.48, 1.08, -.18), (.34, .14, .25), m["Steel"], bench, .025)
    hs.box("Vise jaw", (.48, 1.18, -.18), (.42, .05, .30), m["Steel"], bench, .015)
    for x in (-.58, -.38, -.18):
        hs.box("Tool rack", (x, 1.08, .10), (.045, .16, .045), m["Steel"], bench, .008)
    hs.cyl("Hammer handle", (-.58, 1.22, .10), (-.58, 1.65, .10), .018, m["Rubber"], bench, 12)
    hs.box("Hammer head", (-.58, 1.66, .10), (.18, .08, .07), m["Steel"], bench, .012)
    hs.cyl("Wrench", (-.36, 1.19, .10), (-.36, 1.52, .10), .012, m["Steel"], bench, 12)

    # Storage, lamp and shared trim module.
    storage = hs.empty("MMF_StorageDetail")
    storage["pieceId"] = "crate"
    hs.box("Storage body", (0, .55, 0), (1.4, 1.1, 1.4), m["Paint"], storage, .06)
    hs.box("Storage lid seam", (0, 1.02, -.72), (1.1, .06, .05), m["Steel"], storage, .012)
    for x in (-.38, .38): hs.box("Storage hinge", (x, 1.15, -.44), (.18, .06, .08), m["Steel"], storage, .015)
    hs.box("Storage latch", (0, .64, -.73), (.14, .16, .08), m["Steel"], storage, .018)
    lamp = hs.empty("MMF_LampDetail")
    lamp["pieceId"] = "lamp"
    hs.box("Lamp housing", (0, .48, 0), (.44, .16, .26), m["Dark"], lamp, .03)
    hs.torus("Lamp rim", (0, .38, 0), .17, .025, m["Steel"], lamp, "z", 24, 8)
    hs.box("Lamp glass", (0, .36, 0), (.25, .08, .16), m["Lamp"], lamp, .018)

    for root in (generator, refinery, bench, storage, lamp):
        root["colliderContract"] = "runtime-BuildPieceGeometry"
    hs.join_static()
    hs.uv_all()
    return [generator, refinery, bench, storage, lamp]


def save_kit(stem, factory):
    hs.clear()
    roots = factory()
    bpy.context.scene["graphicsVersion"] = "graphics-v2-industrial"
    bpy.context.scene["assetStem"] = stem
    bpy.context.scene["sourceTool"] = "Blender 5.1 CPU batch"
    bpy.context.view_layer.update()
    out = STAGE / (stem + ".glb")
    bpy.ops.export_scene.gltf(filepath=str(out), export_format="GLB", use_selection=False,
                              export_apply=True, export_texcoords=True, export_normals=True,
                              export_materials="EXPORT", export_yup=True)
    source = SOURCE / (stem + ".blend")
    bpy.ops.wm.save_as_mainfile(filepath=str(source))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    tris = sum(sum(max(0, len(p.vertices)-2) for p in o.data.polygons) for o in meshes)
    return {"asset": stem, "glb": str(out), "source": str(source),
            "triangles": tris, "meshes": len(meshes),
            "roots": [r.name for r in roots] if isinstance(roots, list) else [roots.name]}


def main():
    manifest = [
        save_kit("machine-kit", machine_kit),
        save_kit("station-kit", station_kit),
    ]
    (STAGE / "machine-kit-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print("MMF_GRAPHICS_V2_MACHINE_KIT", json.dumps(manifest))


if __name__ == "__main__":
    main()

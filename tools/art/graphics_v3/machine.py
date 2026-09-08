"""Author the graphics-v3 walker shell for Machine Move Forward.

This is a visual replacement for the runtime machine geometry.  It deliberately
does not touch the Three.js collider or gait code: the GLB carries named roots,
pivot markers, and machine-local coordinates so the integration can swap the
decorative layer while retaining the existing gameplay contract.

Run from the repository root with Blender 5.1:
  blender --background --factory-startup --python tools/art/graphics_v3/machine.py
"""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
STAGE = ROOT / "assets" / "graphics-v3" / "staging"
SOURCE = ROOT / "assets" / "blender" / "graphics-v3"
DOCS = ROOT / "docs" / "art" / "graphics-v3"
for folder in (STAGE, SOURCE, DOCS):
    folder.mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(ROOT / "tools" / "art" / "graphics_v2"))
import hardsurface as hs  # noqa: E402


DECK_W = 10.0
DECK_L = 16.0
DECK_Y = 3.6
DECK_SURFACE = 3.69
DECK_UNDERSIDE = 3.51
HULL_BOTTOM = 0.6
DECK_UNDERSIDE = 3.51
ROOM_INNER_HALF_X = 4.4
ROOM_INNER_HALF_Z = 7.5
WELL_MIN_X, WELL_MAX_X = -3.0, -1.0
WELL_MIN_Z, WELL_MAX_Z = -2.0, 2.0
LEG_HIPS = {
    "front-left": (-6.0, 3.1, -4.5),
    "front-right": (6.0, 3.1, -4.5),
    "rear-left": (-6.0, 3.1, 4.5),
    "rear-right": (6.0, 3.1, 4.5),
}
EQUIPMENT_CONTRACT = {
    "generator": ((-3.0, 4.29, 3.6), (1.5, 1.2, 1.5)),
    "fuel-tank": ((3.1, 4.44, 3.4), (1.6, 1.5, 2.4)),
    "workbench": ((-4.2, 4.19, 0.6), (1.2, 1.0, 2.6)),
    "crate-a": ((3.2, 4.24, 1.4), (1.3, 1.1, 1.3)),
    "crate-b": ((3.2, 4.24, -0.2), (1.3, 1.1, 1.3)),
    "collector": ((-3.4, 4.49, -4.2), (1.2, 1.6, 1.2)),
}


def clear():
    hs.clear()


def materials():
    # Four authored materials keep the walker coherent at a distance.  Their
    # packed 1K base/normal/ORM images carry subtle paint, steel, and rubber
    # variation; geometry supplies the larger manufactured forms.
    return hs.setup_mats("WalkerV3_", [
        ("PaintSage", "68756b", .34, .66, False, 0),
        ("Graphite", "283238", .55, .58, False, 0),
        ("BareSteel", "a7aaa0", .86, .35, False, 0),
        ("Rubber", "1c2222", .06, .91, False, 0),
    ])


def root(name, role, at=(0, 0, 0)):
    obj = hs.empty(name, at)
    obj["assetRole"] = role
    obj["machineLocalAxes"] = "+X port-starboard, +Y up, +Z aft; prow -Z"
    obj["visualOnly"] = True
    return obj


def bolt_row(m, parent, side, y, z_values, radius=.038):
    for z in z_values:
        hs.screw("Recessed captive bolt", (side * 4.93, y, z), m["BareSteel"], parent, radius)


def side_shell(m, parent, side):
    x = side * 4.76
    # Main formed flank, shoulder, and lower doubler.  The stepped thickness
    # leaves the broad room volume open while giving the exterior a real shell.
    hs.box("Pressed side shell", (x, 2.05, 0), (.34, 2.78, 14.9), m["PaintSage"], parent, .13)
    shoulder = hs.box("Rolled upper shoulder", (side * 4.78, 3.31, 0), (.28, .42, 14.5), m["PaintSage"], parent, .10)
    shoulder.rotation_euler[0] = side * 0.05
    hs.box("Graphite lower doubler", (side * 4.78, 1.02, 0), (.40, .58, 14.15), m["Graphite"], parent, .09)
    hs.box("Bottom wear rail", (side * 4.91, .68, 0), (.16, .22, 13.85), m["BareSteel"], parent, .045)

    # Large service doors are separated from the hull by dark gaskets and
    # stand proud enough to catch a grazing highlight.
    for z in (-4.55, -1.30, 2.05, 5.15):
        hs.box("Service-door gasket", (side * 4.952, 2.18, z), (.055, 1.32, 1.18), m["Graphite"], parent, .045)
        hs.box("Service access door", (side * 4.985, 2.19, z), (.055, 1.20, 1.06), m["PaintSage"], parent, .07)
        hs.box("Door lower kick", (side * 5.02, 1.74, z), (.035, .11, .86), m["BareSteel"], parent, .018)
        hs.cyl("Door handle", (side * 5.055, 2.20, z - .26), (side * 5.055, 2.20, z + .26), .032, m["BareSteel"], parent, 16, .006)
        for dz in (-.43, .43):
            hs.screw("Door bolt", (side * 5.05, 2.66, z + dz), m["BareSteel"], parent, .03)

    # Vents are directional and sparse.  They break the blank side at human
    # scale without covering the shell in a repetitive procedural pattern.
    for z in (6.45, 6.75, 7.05):
        hs.box("Engine side vent", (side * 5.01, 2.85, z), (.04, .085, .62), m["Graphite"], parent, .012)
    for z in (-6.70, -6.38):
        hs.box("Fore side vent", (side * 5.01, 2.45, z), (.04, .075, .56), m["Graphite"], parent, .010)

    # Short weld seams are placed only around the access modules and shoulder.
    for z in (-5.15, -1.90, 1.45, 4.55):
        hs.curve("Door perimeter weld", [(side * 5.035, 1.58, z - .43), (side * 5.035, 1.58, z + .43)], .014, m["BareSteel"], parent)
    bolt_row(m, parent, side, 3.36, (-6.7, -3.45, -.2, 3.05, 6.25), .032)


def hull_skin(m):
    hull = root("MMF_HullSkin", "walker-hull-shell")
    hull["deckExtentsMetres"] = "10x16"
    hull["deckCenterY"] = DECK_Y
    hull["walkSurfaceY"] = DECK_SURFACE
    hull["engineRoomFloorY"] = HULL_BOTTOM
    hull["stairwellOpening"] = "x[-3,-1], z[-2,2], aft edge open"

    # Side flanks are the main manufactured mass.  The center remains a shell,
    # not a solid block, so the runtime engine-room opening has visual clearance.
    for side in (-1, 1):
        side_shell(m, hull, side)

    # Under-deck corner castings and fore/aft end caps make the broad body read
    # as welded platework instead of two isolated walls.
    for side in (-1, 1):
        for z in (-6.85, 6.85):
            hs.box("Corner casting", (side * 5.05, 2.84, z), (.55, 1.12, .72), m["Graphite"], hull, .10)
            hs.torus("Casting collar", (side * 5.16, 2.84, z), .18, .04, m["BareSteel"], hull, "x", 24, 8)

    # Lower-room shell rails are along the perimeter only; the playable room
    # stays free of crossbeams and the stair route remains readable.
    for side in (-1, 1):
        hs.box("Engine-room sill", (side * 4.75, .78, 0), (.24, .24, 14.0), m["Graphite"], hull, .05)
    # The runtime lower room is walkable from end to end.  Do not add a
    # floor-height bar across it; the fore/aft shell bulkheads already provide
    # the visible termination outside the inner room boundary.

    # Upper deck-edge armor is a narrow trim system, leaving all 10x16 deck
    # cells open to runtime building and the stairwell unroofed.
    for side in (-1, 1):
        hs.box("Deck edge armor", (side * 4.83, 3.49, 0), (.25, .22, 15.25), m["PaintSage"], hull, .05)
    for z in (-7.72, 7.72):
        hs.box("Deck end armor", (0, 3.49, z), (9.45, .22, .25), m["PaintSage"], hull, .05)

    # A restrained set of deck fasteners and panel seams follows the perimeter
    # rather than filling the walkable center with decorative clutter.
    for side in (-1, 1):
        for z in (-7.0, -4.0, -1.0, 2.0, 5.0, 7.0):
            hs.screw("Deck edge fastener", (side * 4.72, 3.62, z), m["BareSteel"], hull, .03)
    for z in (-7.35, 7.35):
        for x in (-3.5, -1.8, 0, 1.8, 3.5):
            hs.screw("Deck end fastener", (x, 3.62, z), m["BareSteel"], hull, .03)

    return hull


def raked_point(local, angle, translation):
    """Rotate a game-local point about +X and place it in machine space."""
    x, y, z = local
    c, s = math.cos(angle), math.sin(angle)
    return (x + translation[0], c * y - s * z + translation[1], s * y + c * z + translation[2])


def raked_plate(name, bottom_width, top_width, height, depth, angle, translation, mat, parent, bevel=.04):
    """Make a stable cube-derived trapezoidal extrusion with a rolled edge."""
    # Runtime plough points use translation as the bottom profile edge
    # (local Y=0); a cube primitive is centered, so lift it by half its height
    # before applying the rake.
    center = raked_point((0, height * .5, 0), angle, translation)
    bpy.ops.mesh.primitive_cube_add(size=1, location=hs.gv(center))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (bottom_width, depth, height)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ratio = top_width / bottom_width
    for vertex in obj.data.vertices:
        if vertex.co.z > 0:
            vertex.co.x *= ratio
    obj.rotation_euler[0] = angle
    return hs.finish(obj, name, mat, parent, bevel, smooth=False)


def raked_box(name, local_at, size, angle, translation, mat, parent, bevel=.03):
    obj = hs.box(name, raked_point(local_at, angle, translation), size, mat, parent, bevel)
    obj.rotation_euler[0] = angle
    return obj


def engine_skin(m):
    engine = root("MMF_EngineSkin", "walker-engine-casing", (0, 0, 5.45))
    engine["runtimeEquipmentAnchor"] = "engine center x0 y4.59 z6"
    engine["serviceCorridorClear"] = True

    # Twin formed casings are tall enough to read over the aft deck equipment
    # and rounded enough to avoid a faceted tank silhouette.
    for x in (-.78, .78):
        hs.cyl("Formed engine casing", (x, 3.72, 5.35), (x, 5.45, 5.35), .62, m["Graphite"], engine, 40, .045)
        for y in (3.94, 4.52, 5.12):
            hs.torus("Engine casing band", (x, y, 5.35), .63, .045, m["BareSteel"], engine, "y", 36, 8)
        hs.box("Casing inspection plate", (x, 4.57, 4.64), (.68, .42, .06), m["PaintSage"], engine, .035)
        for dz in (-.24, .24):
            hs.screw("Casing inspection bolt", (x, 4.57, 4.60 + dz), m["BareSteel"], engine, .025)

    # Radiator bank faces the fore direction (-Z), with real recessed fins and
    # a thick perimeter frame rather than a flat painted rectangle.
    hs.box("Radiator header", (0, 4.42, 4.62), (2.30, 1.38, .16), m["BareSteel"], engine, .075)
    hs.box("Radiator recess", (0, 4.42, 4.51), (1.98, 1.08, .08), m["Graphite"], engine, .035)
    for x in (-.78, -.52, -.26, 0, .26, .52, .78):
        hs.box("Radiator fin", (x, 4.42, 4.43), (.065, .90, .065), m["BareSteel"], engine, .012)
    for x in (-.98, .98):
        for y in (3.92, 4.92):
            hs.screw("Radiator frame bolt", (x, y, 4.40), m["BareSteel"], engine, .032)

    # Vented exhaust crown and coherent coolant routing.
    for x in (-.70, .70):
        hs.cyl("Exhaust riser", (x, 5.46, 5.72), (x, 6.56, 5.72), .16, m["BareSteel"], engine, 28, .014)
        hs.torus("Exhaust collar", (x, 5.60, 5.72), .18, .035, m["Graphite"], engine, "y", 28, 8)
        hs.box("Exhaust rain cap", (x, 6.65, 5.72), (.36, .10, .36), m["Graphite"], engine, .035)
    hs.curve("Port coolant pipe", [(-1.05, 4.06, 5.80), (-1.20, 4.16, 6.15), (-1.22, 4.65, 6.45), (-1.24, 4.86, 6.98)], .075, m["BareSteel"], engine)
    hs.curve("Starboard coolant pipe", [(1.05, 4.06, 5.80), (1.20, 4.16, 6.15), (1.22, 4.65, 6.45), (1.24, 4.86, 6.98)], .075, m["BareSteel"], engine)
    for x in (-1.43, 1.43):
        hs.torus("Coolant pipe clamp", (x, 4.21, 6.16), .10, .022, m["Graphite"], engine, "z", 20, 6)

    return engine


def prow_skin(m):
    prow = root("MMF_ProwSkin", "walker-fabricated-prow")
    prow["runtimeProwAnchor"] = "z=-8.0; plough remains collider-owned"

    # Match the runtime raked blade silhouette exactly while replacing the
    # single primitive with a fabricated plate, cutting edge, and five ribs.
    rake_angle = -0.42
    rake_translation = (0.0, HULL_BOTTOM - 0.7, -DECK_L / 2 - 1.1)
    blade = raked_plate("Fabricated raked plough blade", 12.4, 11.0, 2.1, .35,
                        rake_angle, rake_translation, m["Graphite"], prow, .08)
    blade["runtimeVisualFallback"] = "plough-visual"
    raked_plate("Plough cutting edge", 12.32, 12.20, .14, .42, rake_angle,
                (0.0, rake_translation[1] - .025, rake_translation[2] - .035),
                m["BareSteel"], prow, .035)
    for x in (-4.0, -2.0, 0.0, 2.0, 4.0):
        raked_box("Plough reinforcement rib", (x, 1.04, .18), (.18, 1.68, .39),
                  rake_angle, rake_translation, m["BareSteel"], prow, .03)

    # Layered castings form a tapered prow out of several plates.  The lower
    # plate is thick; the upper brow is stepped back so the face has depth.
    hs.box("Prow lower casting", (0, 1.62, -8.40), (9.15, 1.56, 1.72), m["Graphite"], prow, .16)
    hs.box("Prow cheek plate port", (-3.48, 2.48, -7.86), (2.10, 1.30, .20), m["PaintSage"], prow, .08)
    hs.box("Prow cheek plate starboard", (3.48, 2.48, -7.86), (2.10, 1.30, .20), m["PaintSage"], prow, .08)
    brow = hs.box("Prow upper brow", (0, 3.13, -8.18), (8.15, .84, 1.18), m["PaintSage"], prow, .11)
    brow.rotation_euler[0] = -0.08
    hs.box("Prow face plate", (0, 2.18, -8.50), (8.25, 1.45, .18), m["PaintSage"], prow, .06)
    # Match the runtime prow block above the deck so replacing that visual
    # fallback cannot leave an invisible blocker in front of the player.
    hs.box("Prow deck armor", (0, 4.24, -7.40), (8.90, 1.02, 1.58), m["Graphite"], prow, .12)
    hs.box("Prow deck brow plate", (0, 4.71, -7.52), (8.35, .16, 1.28), m["PaintSage"], prow, .045)

    # Five vertical ribs and a heavy center shoe articulate the fabricated face.
    for x in (-3.22, -1.62, 0, 1.62, 3.22):
        hs.box("Prow face rib", (x, 2.22, -8.62), (.16, 1.18, .16), m["BareSteel"], prow, .035)
        hs.screw("Prow rib bolt", (x, 2.62, -8.73), m["BareSteel"], prow, .035)
    hs.box("Prow center shoe", (0, 1.05, -8.58), (2.05, .32, .42), m["BareSteel"], prow, .07)

    # A muted ivory-like steel trim band is kept to the same steel material so
    # the palette does not grow; the different surface comes from bevel and map.
    hs.box("Prow maintenance band", (0, 2.86, -8.70), (7.45, .12, .055), m["BareSteel"], prow, .016)
    for x in (-3.55, 3.55):
        hs.box("Prow side gusset", (x, 1.85, -8.20), (.48, 1.22, 1.25), m["Graphite"], prow, .08)
        hs.curve("Prow gusset weld", [(x, 1.28, -8.76), (x, 2.45, -8.76)], .018, m["BareSteel"], prow)

    return prow


def deck_trim(m):
    trim = root("MMF_DeckTrim", "walker-deck-trim")
    trim["walkableEnvelope"] = "10x16m deck; visual trim stays on perimeter"

    # Perimeter handrails and stanchion feet are visual counterparts to the
    # runtime rails.  The port stairwell opening and all central deck cells are
    # deliberately left empty.
    rail_top_y = DECK_Y + .62 + .42
    post_y = DECK_Y + .62 - .06
    for side in (-1, 1):
        x = side * 4.83
        if side < 0:
            rail_segments = [(0, DECK_L - .4)]
        else:
            # Keep the starboard gangway opening at z=[-1.2,1.2] clear.  The
            # runtime retractable ExpeditionGate owns that crossing.
            rail_segments = [(-4.4, 6.4), (4.4, 6.4)]
        for z, length in rail_segments:
            hs.box("Deck rail top", (x, rail_top_y, z), (.09, .09, length), m["BareSteel"], trim, .018)
        for z in (-6.8, -4.7, -2.6, 2.6, 4.7, 6.8):
            hs.box("Deck rail post", (x, post_y, z), (.09, 1.0, .09), m["BareSteel"], trim, .018)
    hs.box("Deck aft rail", (0, rail_top_y, DECK_L / 2 - .12), (DECK_W - .4, .09, .09), m["BareSteel"], trim, .018)

    # Coaming around the stairwell with aft side left open for the runtime ramp.
    for x in (WELL_MIN_X + .20, WELL_MAX_X - .20):
        hs.box("Stairwell coaming", (x, DECK_Y + .09 + .45, 0), (.14, .90, 4.0), m["BareSteel"], trim, .028)
    hs.box("Stairwell fore coaming", (-2.0, DECK_Y + .09 + .45, -1.80), (1.60, .90, .14), m["BareSteel"], trim, .028)

    # Small perimeter drain plates and cable clips give the deck scale without
    # pretending the walkable floor is tiled with obstacles.
    for side in (-1, 1):
        for z in (-6.6, -3.3, 3.3, 6.6):
            hs.box("Perimeter drain plate", (side * 4.35, 3.72, z), (.46, .045, .24), m["Graphite"], trim, .014)
    hs.curve("Port deck cable", [(-4.2, 3.76, 5.8), (-4.15, 3.80, 6.6), (-4.2, 3.80, 7.2)], .028, m["Rubber"], trim)

    return trim


def equipment_skin(m):
    """Replace the six large runtime equipment boxes with closed skins."""
    roots = []
    # Exact runtime envelopes from MachineGeometry.equipment.
    generator = root("MMF_Equipment_generator", "runtime-equipment-skin")
    generator["runtimeEquipmentId"] = "generator"
    hs.box("Generator closed casing", (-3.0, 4.29, 3.6), (1.38, 1.08, 1.38), m["Graphite"], generator, .10)
    hs.box("Generator end cap", (-3.0, 4.78, 3.6), (1.10, .10, 1.10), m["PaintSage"], generator, .045)
    hs.torus("Generator fan guard", (-3.0, 4.82, 3.6), .34, .055, m["BareSteel"], generator, "y", 28, 8)
    for x in (-3.42, -3.18, -2.94, -2.70):
        hs.box("Generator vent", (x, 4.42, 2.99), (.075, .10, .20), m["Graphite"], generator, .012)
    roots.append(generator)

    tank = root("MMF_Equipment_fuel-tank", "runtime-equipment-skin")
    tank["runtimeEquipmentId"] = "fuel-tank"
    hs.cyl("Rounded fuel tank", (3.1, 4.44, 2.48), (3.1, 4.44, 4.32), .62, m["PaintSage"], tank, 40, .035)
    for z in (2.95, 3.85):
        hs.torus("Fuel tank band", (3.1, 4.44, z), .63, .045, m["BareSteel"], tank, "z", 32, 8)
    hs.cyl("Fuel tank filler neck", (3.1, 4.92, 3.4), (3.1, 5.04, 3.4), .12, m["BareSteel"], tank, 24, .012)
    hs.box("Fuel tank gauge panel", (3.1, 4.50, 2.27), (.52, .34, .045), m["Graphite"], tank, .025)
    roots.append(tank)

    bench = root("MMF_Equipment_workbench", "runtime-equipment-skin")
    bench["runtimeEquipmentId"] = "workbench"
    hs.box("Closed workshop cabinet", (-4.2, 4.16, .6), (1.10, .88, 2.44), m["Graphite"], bench, .075)
    hs.box("Workbench top plate", (-4.2, 4.65, .6), (1.16, .08, 2.50), m["PaintSage"], bench, .035)
    for z in (-.34, .28, .90, 1.52):
        hs.box("Workbench drawer face", (-4.2, 4.30, z), (1.00, .04, .44), m["PaintSage"], bench, .018)
        hs.box("Workbench drawer pull", (-4.2, 4.28, z), (.20, .045, .05), m["BareSteel"], bench, .012)
    hs.box("Workbench side guard", (-4.78, 4.28, .6), (.05, .70, 2.20), m["BareSteel"], bench, .018)
    roots.append(bench)

    for name, z in (("crate-a", 1.4), ("crate-b", -.2)):
        crate = root(f"MMF_Equipment_{name}", "runtime-equipment-skin")
        crate["runtimeEquipmentId"] = name
        hs.box("Closed shipping crate", (3.2, 4.24, z), (1.22, 1.02, 1.22), m["PaintSage"], crate, .06)
        for x in (2.82, 3.20, 3.58):
            hs.box("Crate rib", (x, 4.26, z - .63), (.08, .82, .05), m["BareSteel"], crate, .014)
        hs.box("Crate latch", (3.2, 4.18, z - .62), (.18, .20, .06), m["BareSteel"], crate, .014)
        roots.append(crate)

    collector = root("MMF_Equipment_collector", "runtime-equipment-skin")
    collector["runtimeEquipmentId"] = "collector"
    hs.box("Closed salvage winch housing", (-3.4, 4.43, -4.2), (1.10, 1.46, 1.10), m["Graphite"], collector, .075)
    hs.box("Collector top plate", (-3.4, 5.20, -4.2), (.96, .08, .96), m["PaintSage"], collector, .035)
    for z in (-4.55, -3.85):
        hs.cyl("Collector guide roller", (-3.78, 4.48, z), (-3.02, 4.48, z), .17, m["BareSteel"], collector, 24, .014)
        hs.torus("Collector roller rim", (-3.78, 4.48, z), .17, .035, m["Graphite"], collector, "x", 24, 8)
    hs.box("Collector cable guide", (-3.4, 4.28, -4.77), (.46, .32, .05), m["BareSteel"], collector, .018)
    roots.append(collector)
    return roots


def leg_housing(m, leg_id, hip):
    r = root(f"MMF_LegHousing_{leg_id}", "walker-leg-housing", hip)
    r["runtimeHip"] = list(hip)
    r["upperLegMetres"] = 2.1
    r["lowerLegMetres"] = 2.1
    r["pivotContract"] = "HipPivot -> KneePivot (-Y 2.1) -> FootPivot (-Y 4.2)"
    # The static root is only the hull-side mounting collar.  The moving
    # shoulder armor is authored below as the matching Hip module, so there is
    # no duplicate static limb when the runtime rehomes that module.
    hs.box("Leg mount backplate", (hip[0], hip[1] - .08, hip[2] + .66), (1.58, 1.08, .32), m["Graphite"], r, .10)
    hs.torus("Leg mount collar", (hip[0], hip[1], hip[2] + .48), .44, .075, m["BareSteel"], r, "x", 32, 10)
    hs.screw("Leg mount bolt", (hip[0], hip[1] + .40, hip[2] + .48), m["BareSteel"], r, .038)
    # `hs.empty` keeps a parent's local transform, so these marker positions
    # are expressed relative to the hip root.  This makes the exported marker
    # chain usable by a future skinned leg without double-applying the hip.
    hs.empty("HipPivot", (0, 0, 0), r)["pivotRole"] = "runtime-legs-root"
    hs.empty("KneePivot", (0, -2.1, 0), r)["pivotRole"] = "runtime-knee"
    hs.empty("FootPivot", (0, -4.2, 0), r)["pivotRole"] = "runtime-foot"
    return r


def authored_leg_module(m, leg_id, part):
    """Build one segment in the local space consumed by MachineLegs.

    Hip/Thigh/Knee/Shin/Foot nodes are intentionally top-level origins. The
    runtime clones each node under its already-solved pivot group; exporting
    world-space translations here would apply the hip or knee twice.
    """
    name = f"MMF_WalkerLeg_{leg_id}_{part}"
    module = root(name, "walker-authored-leg-segment")
    module["legId"] = leg_id
    module["segment"] = part
    module["localPivot"] = True
    if part == "Hip":
        hs.box("Moving hip armor", (0, -.06, 0), (1.34, 1.12, 1.48), m["PaintSage"], module, .12)
        hs.box("Hip armor lower inset", (0, -.53, -.72), (.72, .32, .16), m["Graphite"], module, .045)
        hs.torus("Hip moving bearing", (0, 0, -.76), .38, .065, m["BareSteel"], module, "x", 28, 8)
        for x in (-.43, .43):
            hs.screw("Hip armor bolt", (x, .40, -.76), m["BareSteel"], module, .03)
    elif part == "Thigh":
        hs.box("Formed thigh shell", (0, -1.04, 0), (.74, 2.02, .92), m["Graphite"], module, .095)
        hs.box("Thigh face guard", (0, -1.06, -.49), (.48, 1.44, .10), m["PaintSage"], module, .045)
        hs.cyl("Thigh hydraulic ram", (0, -.20, .52), (0, -1.83, .52), .105, m["BareSteel"], module, 20, .012)
        hs.torus("Thigh ram collar", (0, -.28, .52), .135, .026, m["BareSteel"], module, "z", 20, 6)
        for y in (-.35, -1.72):
            hs.screw("Thigh service bolt", (.30, y, -.50), m["BareSteel"], module, .027)
    elif part == "Knee":
        hs.cyl("Knee bearing drum", (-.48, 0, 0), (.48, 0, 0), .39, m["BareSteel"], module, 32, .018)
        hs.torus("Knee port race", (-.51, 0, 0), .30, .05, m["Graphite"], module, "x", 28, 8)
        hs.torus("Knee starboard race", (.51, 0, 0), .30, .05, m["Graphite"], module, "x", 28, 8)
        hs.box("Knee armor bridge", (0, -.02, -.41), (1.02, .44, .20), m["Graphite"], module, .055)
        for x in (-.28, .28):
            hs.screw("Knee shield bolt", (x, -.24, -.54), m["BareSteel"], module, .028)
    elif part == "Shin":
        hs.box("Formed shin shell", (0, -1.02, 0), (.54, 1.94, .70), m["Graphite"], module, .075)
        hs.box("Shin leading guard", (0, -1.04, -.39), (.42, 1.48, .12), m["PaintSage"], module, .045)
        hs.cyl("Shin exposed piston", (.28, -.22, .38), (.28, -1.82, .38), .075, m["BareSteel"], module, 16, .008)
        for y in (-.62, -.92, -1.22):
            hs.box("Shin vent", (0, y, -.40), (.28, .065, .035), m["Rubber"], module, .012)
    elif part == "Foot":
        # The runtime foot point is the sole contact at local Y=0.  The pad
        # rises from that point, exactly as MachineLegs' procedural foot does.
        hs.box("Manufactured foot pad", (0, .15, 0), (1.30, .30, 2.10), m["Rubber"], module, .085)
        hs.box("Foot steel top plate", (0, .24, 0), (1.10, .08, 1.72), m["BareSteel"], module, .045)
        for z in (-.72, -.24, .24, .72):
            hs.box("Foot sole cleat", (0, .06, z), (1.12, .10, .18), m["Graphite"], module, .025)
        for x in (-.46, .46):
            hs.screw("Foot plate bolt", (x, .24, -.67), m["BareSteel"], module, .03)
        module["footContactY"] = 0.0
        module["footSoleBoundsY"] = [0.0, 0.30]
    return module


def build():
    m = materials()
    roots = [hull_skin(m), engine_skin(m), prow_skin(m), deck_trim(m), *equipment_skin(m)]
    for name, hip in LEG_HIPS.items():
        roots.append(leg_housing(m, name, hip))
        for part in ("Hip", "Thigh", "Knee", "Shin", "Foot"):
            roots.append(authored_leg_module(m, name, part))
    hs.join_static()
    hs.uv_all()
    return roots


def triangulate_for_export():
    # Tangent generation is deterministic only once the bevelled/ngon helper
    # meshes have an explicit triangle split.  This preserves the authored
    # silhouette while making the packed normal maps portable across loaders.
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        mod = obj.modifiers.new("Export triangulation", "TRIANGULATE")
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.select_set(False)


def lower_room_intrusions():
    """Find authored static vertices inside the runtime lower-room walk volume."""
    intrusions = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        parent = obj.parent
        while parent and parent.parent:
            parent = parent.parent
        if parent and parent.name.startswith("MMF_WalkerLeg_"):
            # These modules are intentionally local pivot-space geometry.  The
            # runtime removes them from the body root and rehomes them under
            # the animated leg groups before drawing.
            continue
        for vertex in obj.data.vertices:
            world = obj.matrix_world @ vertex.co
            game_x, game_y, game_z = world.x, world.z, -world.y
            if (
                HULL_BOTTOM + .01 < game_y < DECK_UNDERSIDE - .01
                and abs(game_x) < ROOM_INNER_HALF_X - .01
                and abs(game_z) < ROOM_INNER_HALF_Z - .01
            ):
                intrusions.append({"object": obj.name, "vertex": vertex.index,
                                   "game": [round(game_x, 3), round(game_y, 3), round(game_z, 3)]})
                if len(intrusions) >= 24:
                    return intrusions
    return intrusions


def authored_module_bounds_y():
    bounds = {}
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or not obj.parent or not obj.parent.name.startswith("MMF_WalkerLeg_"):
            continue
        module = obj.parent.name
        values = bounds.setdefault(module, [1e9, -1e9])
        for vertex in obj.data.vertices:
            world = obj.matrix_world @ vertex.co
            game_y = world.z
            values[0] = min(values[0], game_y)
            values[1] = max(values[1], game_y)
    return {name: [round(v, 4) for v in values] for name, values in sorted(bounds.items())}


def equipment_bounds():
    bounds = {}
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or not obj.parent or not obj.parent.name.startswith("MMF_Equipment_"):
            continue
        name = obj.parent.name.removeprefix("MMF_Equipment_")
        values = bounds.setdefault(name, [Vector((1e9, 1e9, 1e9)), Vector((-1e9, -1e9, -1e9))])
        for vertex in obj.data.vertices:
            world = obj.matrix_world @ vertex.co
            game = Vector((world.x, world.z, -world.y))
            values[0].x = min(values[0].x, game.x); values[0].y = min(values[0].y, game.y); values[0].z = min(values[0].z, game.z)
            values[1].x = max(values[1].x, game.x); values[1].y = max(values[1].y, game.y); values[1].z = max(values[1].z, game.z)
    report = {}
    for name, (low, high) in bounds.items():
        report[name] = {"min": [round(v, 4) for v in low], "max": [round(v, 4) for v in high]}
    return report


def export():
    clear()
    roots = build()
    triangulate_for_export()
    intrusions = lower_room_intrusions()
    if intrusions:
        raise RuntimeError(f"lower-room visual intrusion(s): {intrusions[:4]}")
    module_bounds_y = authored_module_bounds_y()
    # Joined module meshes are parented to their named module roots. Contact is
    # the procedural foot target: no authored sole may dip below Y=0.
    foot_modules = {name: bounds for name, bounds in module_bounds_y.items() if name.endswith("_Foot")}
    if len(foot_modules) != 4 or any(bounds[0] < -.001 or bounds[1] > .301 for bounds in foot_modules.values()):
        raise RuntimeError(f"authored foot bounds invalid: {foot_modules}")
    equipment_bounds_report = equipment_bounds()
    equipment_overflow = {}
    for equipment_id, (center, size) in EQUIPMENT_CONTRACT.items():
        expected_min = [center[i] - size[i] * .5 for i in range(3)]
        expected_max = [center[i] + size[i] * .5 for i in range(3)]
        actual = equipment_bounds_report.get(equipment_id)
        if actual is None:
            equipment_overflow[equipment_id] = {"reason": "missing mesh root"}
            continue
        overflow = {}
        for axis, key in enumerate(("x", "y", "z")):
            lo = actual["min"][axis]
            hi = actual["max"][axis]
            if lo < expected_min[axis] - .015 or hi > expected_max[axis] + .015:
                overflow[key] = {
                    "actual": [lo, hi],
                    "expected": [round(expected_min[axis], 4), round(expected_max[axis], 4)],
                }
        if overflow:
            equipment_overflow[equipment_id] = overflow
    if equipment_overflow:
        raise RuntimeError(f"equipment visual envelope overflow(s): {equipment_overflow}")
    bpy.context.scene["graphicsVersion"] = "graphics-v3-walker"
    bpy.context.scene["assetStem"] = "machine"
    bpy.context.scene["sourceTool"] = "Blender 5.1 CPU batch"
    bpy.context.scene["visualOnly"] = True
    bpy.context.scene["machineContract"] = "runtime MachineGeometry + MachineLegs; no collider replacement"
    bpy.context.view_layer.update()

    out = STAGE / "machine-walker.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(out), export_format="GLB", use_selection=False,
        export_apply=True, export_texcoords=True, export_normals=True,
        export_materials="EXPORT", export_yup=True, export_extras=True,
    )
    source = SOURCE / "machine-walker.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(source))

    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    triangles = sum(sum(max(0, len(p.vertices) - 2) for p in o.data.polygons) for o in meshes)
    bbox = [Vector((1e9, 1e9, 1e9)), Vector((-1e9, -1e9, -1e9))]
    for o in meshes:
        for corner in o.bound_box:
            world = o.matrix_world @ Vector(corner)
            bbox[0].x = min(bbox[0].x, world.x); bbox[0].y = min(bbox[0].y, world.y); bbox[0].z = min(bbox[0].z, world.z)
            bbox[1].x = max(bbox[1].x, world.x); bbox[1].y = max(bbox[1].y, world.y); bbox[1].z = max(bbox[1].z, world.z)
    # Blender stores the helper's (x, -gameZ, gameY) coordinates.  Report the
    # contract in game coordinates so reviewers can compare it to runtime code.
    game_min = [bbox[0].x, bbox[0].z, -bbox[1].y]
    game_max = [bbox[1].x, bbox[1].z, -bbox[0].y]
    manifest = {
        "asset": "machine-walker",
        "glb": str(out),
        "source": str(source),
        "triangles": triangles,
        "meshes": len(meshes),
        "lowerRoomVisualIntrusions": intrusions,
        "authoredModuleBoundsY": module_bounds_y,
        "equipmentBounds": equipment_bounds_report,
        "equipmentOverflow": equipment_overflow,
        "roots": [r.name for r in roots],
        "boundsGameMetres": {"min": [round(v, 3) for v in game_min], "max": [round(v, 3) for v in game_max]},
        "contract": {
            "deck": [10.0, 16.0, 3.6],
            "walkSurfaceY": 3.69,
            "engineRoomFloorY": 0.6,
            "stairwell": {"x": [-3.0, -1.0], "z": [-2.0, 2.0], "aftEdgeOpen": True},
            "legHips": LEG_HIPS,
            "runtimeOwned": ["colliders", "deckCells", "MachineLegs IK", "plough collider"],
        },
    }
    (STAGE / "machine-walker-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    result = export()
    print("MMF_GRAPHICS_V3_MACHINE", json.dumps(result))

"""Graphics-v2 expedition wreck and boarding skiff.

Run in an isolated Blender 5.1 process:
  blender --background --factory-startup --python tools/art/graphics_v2/expedition.py

The two factories keep gameplay anchors in game metres and export separate
staged GLBs.  They reuse the read-only hard-surface helpers for UVs, embedded
PBR images, formed edges and smooth cylinders; this file owns only expedition
asset geometry and never edits the live Blender session.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import hardsurface as exp_hs

bpy = exp_hs.bpy
Vector = exp_hs.Vector
ROOT = Path(__file__).resolve().parents[3]
STAGE = ROOT / "assets" / "graphics-v2" / "staging"
SOURCE = ROOT / "assets" / "blender" / "graphics-v2"
STAGE.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)


def exp_module(name: str, parent):
    return exp_hs.empty(name, (0, 0, 0), parent)


def exp_screw_row(name: str, start, count: int, step: float, mat, parent, axis="z"):
    for i in range(count):
        x, y, z = start
        if axis == "z":
            z += i * step
        else:
            x += i * step
        exp_hs.screw(f"{name}_{i:02d}", (x, y, z), mat, parent, .016)


def exp_ribbed_wall(name: str, center, size, mat, dark, parent, ribs=5, axis="z"):
    exp_hs.box(name, center, size, mat, parent, .035)
    if axis == "z":
        for i in range(ribs):
            t = (i + 1) / (ribs + 1)
            z = center[2] - size[2] * .5 + size[2] * t
            exp_hs.box(f"{name}_rolled_rib_{i:02d}", (center[0] - size[0] * .56, center[1], z),
                       (.08, size[1] * .92, .055), dark, parent, .014)
    else:
        for i in range(ribs):
            t = (i + 1) / (ribs + 1)
            x = center[0] - size[0] * .5 + size[0] * t
            exp_hs.box(f"{name}_rolled_rib_{i:02d}", (x, center[1], center[2] - size[2] * .56),
                       (.055, size[1] * .92, .08), dark, parent, .014)


def exp_gyro(parent, mats):
    # This exact empty is an interaction contract in Destination.ts.
    gyro = exp_hs.empty("CourseGyro", (4.5, .92, 3), parent)
    exp_hs.cyl("Gyro spindle", (4.5, .92, 3), (4.5, 1.34, 3), .095, mats["ochre"], gyro, 32, .006)
    for y, radius in ((1.01, .27), (1.16, .34), (1.31, .23)):
        exp_hs.cyl(f"Gyro bearing disc {y:.2f}", (4.5, y, 3), (4.5, y + .045, 3),
                   radius, mats["steel"], gyro, 40, .004)
        exp_hs.torus(f"Gyro disc edge {y:.2f}", (4.5, y + .022, 3), radius, .018,
                     mats["dark"], gyro, "y", 40, 8)
    exp_hs.box("Gyro status", (4.5, 1.39, 3), (.13, .065, .13), mats["glass"], gyro, .024)
    return gyro


def exp_journal(name: str, at, parent, mats):
    node = exp_hs.empty(name, at, parent)
    exp_hs.box(f"{name}_brass_frame", (at[0], at[1], at[2]), (.43, .035, .33), mats["ochre"], node, .014)
    exp_hs.box(f"{name}_glass_face", (at[0], at[1] + .022, at[2]), (.34, .008, .24), mats["glass"], node, .006)
    for i in range(4):
        exp_hs.box(f"{name}_line_{i}", (at[0], at[1] + .028, at[2] - .075 + i * .05),
                   (.24 if i != 2 else .15, .004, .009), mats["dark"], node, .002)
    return node


def exp_route(parent, mats):
    # Exact interaction node and local wall placement from Destination.ts.
    node = exp_hs.empty("JournalRoute", (-5.74, 1.05, -2), parent)
    exp_hs.box("Route frame", (-5.755, 1.05, -2), (.035, .48, .36), mats["ochre"], node, .012)
    exp_hs.box("Route glass", (-5.733, 1.05, -2), (.009, .39, .27), mats["glass"], node, .005)
    for i, y in enumerate((.95, 1.03, 1.11, 1.18)):
        exp_hs.box(f"Route line {i}", (-5.727, y, -2), (.006, .012, .18 if i != 2 else .11), mats["dark"], node, .001)
    return node


def expedition_wreck():
    mats = exp_hs.setup_mats("ExpWreck_", [
        ("Hull", "66766b", .43, .66, False, 0),
        ("Rust", "784b31", .39, .88, False, 0),
        ("Steel", "98a29f", .84, .36, False, 0),
        ("Dark", "263236", .67, .62, False, 0),
        ("Ochre", "b88a43", .25, .70, False, 0),
        ("Canvas", "4e524b", .04, .89, False, 0),
        ("Glass", "8db4b0", .08, .16, True, 0),
    ])
    mats.update({key.lower(): value for key, value in list(mats.items())})
    root = exp_hs.empty("MMF_ExpeditionWreck", (0, 0, 0))
    root["graphicsVersion"] = "graphics-v2-industrial"
    root["floorSurfaceY"] = 0.0
    root["walkableBounds"] = "x:-6..6,z:-9..9"
    root["openingContract"] = "x=-6 and x=2; z=-1..1; headerY>=2.5"
    root["visualOnlyDecor"] = True

    hull = exp_module("Wreck_HullStructure", root)
    under = exp_module("Wreck_Underframe", root)
    cargo = exp_module("Wreck_CargoBay", root)
    crew = exp_module("Wreck_CrewBay", root)
    nav = exp_module("Wreck_NavigationBay", root)
    machinery = exp_module("Wreck_Machinery", root)
    roof = exp_module("Wreck_BrokenRoof", root)
    # Keep the gangway node on the wreck floor plane. The plate is centred at
    # y=-.08 with a .16m thickness, so its upper surface lands exactly at y=0
    # for the boarding ray and capsule contract.
    gangway = exp_hs.empty("Gangway", (-6.5, 0, 0), root)
    gangway["visualOnly"] = True

    # Floor top is exactly Y=0; small seam geometry stays below the walking
    # plane so floor ray and capsule tests see one continuous surface.
    exp_hs.box("WalkableFloor", (0, -.10, 0), (12, .20, 18), mats["Hull"], hull, 0)
    for x in (-5.0, -2.5, 0, 2.5, 5.0):
        exp_hs.box(f"Deck longitudinal seam {x}", (x, -.003, 0), (.018, .006, 17.6), mats["Dark"], hull, 0)
    for z in (-6, -3, 3, 6):
        exp_hs.box(f"Deck cross seam {z}", (0, -.003, z), (11.6, .006, .018), mats["Dark"], hull, 0)
    for z in (-.79, .79):
        exp_hs.box(f"Central lane marking {z}", (-.2, .006, z), (10.4, .008, .055), mats["Ochre"], hull, 0)

    # The visual shell mirrors the physics shell. Openings remain a clear 2m
    # wide route and all headers begin above the 2.5m clearance contract.
    for x in (-5.9, 2.0):
        for z in (-5.0, 5.0):
            exp_ribbed_wall(f"Port bulkhead {x}_{z}", (x, 1.25, z), (.24, 2.5, 8), mats["Hull"], mats["Dark"], hull, 7)
        for z in (-1.14, 1.14):
            exp_hs.box(f"Door rolled jamb {x}_{z}", (x, 1.25, z), (.31, 2.48, .15), mats["Steel"], hull, .045)
            exp_hs.cyl(f"Door hinge spine {x}_{z}", (x - .18, .30, z), (x - .18, 2.35, z), .045, mats["Dark"], hull, 24, .005)
        exp_hs.box(f"Door head {x}", (x, 2.62, 0), (.34, .24, 2.25), mats["Ochre"], hull, .035)
        exp_screw_row(f"Door head fastener {x}", (x - .19, 2.62, - .82), 5, .41, mats["Steel"], hull)
    exp_ribbed_wall("Starboard outer shell", (5.9, 1.25, 0), (.24, 2.5, 18), mats["Rust"], mats["Dark"], hull, 13)
    for z in (-8.9, 8.9):
        exp_ribbed_wall(f"End bulkhead {z}", (0, 1.25, z), (12, 2.5, .24), mats["Hull"], mats["Dark"], hull, 9, "x")
    # Thick window frames sit high on the starboard wall; the wall remains a
    # sealed collider while the glass recesses break up the blank surface.
    for z in (-6.2, -3.9, 3.9, 6.2):
        exp_hs.box(f"Window frame top {z}", (5.72, 1.95, z), (.12, .54, 1.46), mats["Steel"], hull, .045)
        exp_hs.box(f"Window inset {z}", (5.645, 1.95, z), (.012, .38, 1.18), mats["Glass"], hull, .018)
        for dz in (-.48, .48):
            exp_hs.cyl(f"Window mullion {z}_{dz}", (5.57, 1.5, z + dz), (5.57, 2.4, z + dz), .024, mats["Dark"], hull, 20, .003)

    # Layered legs and cross-braces make the stranded section read as a hull,
    # while remaining under the walkable shell and outside the route.
    for x in (-5.1, 0, 5.1):
        exp_hs.box(f"Underframe longitudinal {x}", (x, -.58, 0), (.42, .95, 17.6), mats["Rust"], under, .055)
        for z in (-7.5, -4.5, -1.5, 1.5, 4.5, 7.5):
            exp_hs.cyl(f"Frame gusset {x}_{z}", (x, -.15, z), (x * 1.08, -2.4, z + .1), .14, mats["Steel"], under, 24, .008)
    for z in (-7, -3.5, 0, 3.5, 7):
        exp_hs.box(f"Underframe crossmember {z}", (0, -.40, z), (11.5, .46, .36), mats["Dark"], under, .03)
        for x in (-4.8, -2.4, 0, 2.4, 4.8):
            exp_hs.screw(f"Crossmember bolt {z}_{x}", (x, -.14, z), mats["Steel"], under, .022)

    # The roof is broken into a few overhead panels and ribs; it leaves the
    # central interior visually open and never adds floor blockers.
    for z, length in ((-7.5, 2.8), (-6.1, 1.7), (7.9, 3.0)):
        exp_hs.box(f"Broken roof sheet {z}", (1.4, 3.55, z), (6.8, .075, length), mats["Rust"], roof, .025)
        for x in (-1.2, .2, 1.6, 3.0, 4.4):
            exp_hs.box(f"Roof corrugation {z}_{x}", (x, 3.50, z), (.055, .13, length + .08), mats["Steel"], roof, .012)
    for z in (-7.6, -3.8, 3.8, 7.6):
        exp_hs.cyl(f"Roof rib {z}", (-5.0, 3.02, z), (5.0, 3.02, z), .065, mats["Dark"], roof, 24, .006)
    for x, z in ((-4.8, -7.7), (4.8, -7.7), (4.8, 7.8)):
        exp_hs.cyl(f"Broken roof upright {x}_{z}", (x, 2.45, z), (x, 3.7, z), .08, mats["Dark"], roof, 24, .008)

    # Cargo bay: all dressing stays inside the existing cargo collider and
    # leaves the centre lane clear. The named node is at the interaction point.
    exp_journal("JournalCargo", (-1, 1.115, -5.8), root, mats)
    exp_hs.box("Cargo crate base", (-1, .55, -5.8), (2.2, 1.1, 2.2), mats["Canvas"], cargo, .06)
    for z in (-6.55, -5.8, -5.05):
        exp_hs.box(f"Cargo crate strap {z}", (-1, .58, z), (2.30, 1.15, .055), mats["Ochre"], cargo, .014)
    for x in (-1.65, -.35):
        exp_hs.box(f"Cargo corner rail {x}", (x, .62, -5.8), (.07, 1.3, 2.3), mats["Steel"], cargo, .018)
    for x, z in ((-2.5, -6.45), (-2.35, -5.05), (.4, -6.2), (.25, -5.3)):
        exp_hs.box(f"Cargo loose case {x}_{z}", (x, .34, z), (.55, .68, .72), mats["Dark"], cargo, .035)
        exp_screw_row(f"Cargo case bolts {x}_{z}", (x - .22, .70, z - .25), 3, .25, mats["Steel"], cargo)

    # Crew bay has a seat/tool rack against the end wall, with the route lane
    # still open through the middle of the wreck.
    exp_journal("JournalCrew", (-2, .815, 5.8), root, mats)
    exp_hs.box("Crew bench", (-2, .42, 5.8), (2.8, .84, 1.6), mats["Canvas"], crew, .06)
    exp_hs.box("Crew bench cushion", (-2, .89, 5.8), (2.45, .16, 1.3), mats["Canvas"], crew, .045)
    for x in (-3.15, -2, -.85):
        exp_hs.box(f"Crew seat divider {x}", (x, 1.02, 5.8), (.06, .55, 1.35), mats["Steel"], crew, .012)
    for x in (-4.9, -4.35, -3.8, -3.25):
        exp_hs.cyl(f"Crew storage peg {x}", (x, 1.35, 8.55), (x, 2.10, 8.55), .032, mats["Steel"], crew, 20, .004)
        exp_hs.box(f"Crew storage case {x}", (x, 1.65, 8.38), (.32, .5, .22), mats["Dark"], crew, .025)

    # Navigation bay: the gyro remains visible from the route and its pedestal
    # is the only visual object inside its matching interaction footprint.
    exp_hs.box("Gyro pedestal", (4.5, .45, 3), (.9, .9, .9), mats["Dark"], nav, .055)
    exp_hs.torus("Gyro pedestal ring", (4.5, .88, 3), .38, .03, mats["Steel"], nav, "y", 40, 8)
    exp_gyro(root, mats)
    exp_hs.box("Navigation console", (4.85, 1.05, 4.35), (1.25, 1.0, .48), mats["Hull"], nav, .05)
    exp_hs.box("Navigation display", (4.86, 1.47, 4.10), (.64, .28, .025), mats["Glass"], nav, .012)
    for x in (4.48, 4.72, 4.96, 5.20):
        exp_hs.screw(f"Navigation fastener {x}", (x, 1.54, 4.56), mats["Steel"], nav, .012)
    exp_route(root, mats)

    # Engineering machinery hugs the starboard wall, away from the route and
    # from all three existing journal footprints.
    for z in (-4.1, -2.8, 1.0, 2.3):
        exp_hs.cyl(f"Pressure vessel {z}", (5.18, .56, z), (5.18, 1.62, z), .31, mats["Dark"], machinery, 36, .01)
        exp_hs.torus(f"Pressure vessel rim {z}", (5.18, .56, z), .31, .022, mats["Steel"], machinery, "z", 32, 7)
        exp_hs.torus(f"Pressure vessel collar {z}", (5.18, 1.52, z), .31, .022, mats["Ochre"], machinery, "z", 32, 7)
    for z in (-4.3, -3.5, -2.7, 1.0, 1.8, 2.6):
        exp_hs.curve(f"Machinery pipe {z}", [(5.25, 1.3, z), (5.45, 1.7, z), (5.46, 2.25, z + .15)],
                     .045, mats["Steel"], machinery)
    exp_hs.box("Engineering service panel", (5.35, 2.0, -.5), (.35, 1.0, 2.3), mats["Hull"], machinery, .045)
    for y in (1.65, 1.92, 2.19):
        exp_hs.box(f"Service panel slot {y}", (5.16, y, -.5), (.025, .055, 1.45), mats["Dark"], machinery, .008)
    # Recessed ventilation banks add manufactured scale to the long wall. They
    # sit flush against the existing starboard shell, outside the walk lane.
    for bank, z in enumerate((-7.4, -5.9, -4.4, -2.9, -1.4, .1, 1.6, 3.1, 4.6, 6.1)):
        for row in range(8):
            y = .48 + row * .205
            exp_hs.box(f"Wall vent {bank}_{row}", (5.735, y, z), (.045, .052, .78),
                       mats["Dark"] if row % 3 else mats["Steel"], machinery, .012)
    for z in (-1.2, -.7, -.2):
        exp_hs.cyl(f"Service cable {z}", [(4.92, 1.45, z), (5.45, 1.45, z + .4)][0],
                   [(4.92, 1.45, z), (5.45, 1.45, z + .4)][1], .018, mats["Canvas"], machinery, 16)

    # Gangway is a visual child toggled by Destination.setDocked().
    exp_hs.box("Gangway plate", (-6.5, -.08, 0), (1.0, .16, 2.0), mats["Steel"], gangway, 0)
    for z in (-.88, .88):
        exp_hs.box(f"Gangway edge {z}", (-6.5, .012, z), (1.0, .018, .10), mats["Ochre"], gangway, 0)
    for x in (-6.82, -6.5, -6.18):
        exp_hs.box(f"Gangway grip {x}", (x, .009, 0), (.025, .018, 1.7), mats["Dark"], gangway, 0)

    exp_hs.join_static()
    exp_hs.uv_all()
    return root


def skiff_weapon(parent, mats):
    yaw = exp_hs.empty("SkiffGunYaw", (0, 2.04, -1.95), parent)
    pitch = exp_hs.empty("SkiffGunPitch", (0, 0, 0), yaw)
    pitch["forwardAxis"] = "-Z"
    exp_hs.box("Skiff gun receiver", (0, 2.04, -1.99), (.36, .28, .56), mats["dark"], pitch, .045)
    exp_hs.box("Skiff gun top cover", (0, 2.20, -1.99), (.39, .06, .53), mats["ochre"], pitch, .018)
    exp_hs.cyl("Skiff barrel", (0, 2.04, -2.20), (0, 2.04, -3.03), .061, mats["steel"], pitch, 40, .005)
    exp_hs.cyl("Skiff bore", (0, 2.04, -3.00), (0, 2.04, -3.08), .028, mats["dark"], pitch, 32, .002)
    for z in (-2.36, -2.56, -2.76):
        exp_hs.torus(f"Skiff cooling ring {z}", (0, 2.04, z), .083, .013, mats["steel"], pitch, "z", 32, 7)
    exp_hs.box("Skiff feed housing", (.28, 2.04, -2.00), (.24, .32, .42), mats["hull"], pitch, .03)
    exp_hs.box("Skiff sight", (0, 2.34, -2.10), (.12, .10, .18), mats["dark"], pitch, .018)
    exp_hs.box("Skiff sight glass", (0, 2.40, -2.10), (.07, .014, .08), mats["glass"], pitch, .006)
    muzzle = exp_hs.empty("SkiffMuzzle", (0, 0, -1.1), pitch)
    muzzle["anchor"] = "muzzle"
    return yaw, pitch, muzzle


def expedition_skiff():
    mats = exp_hs.setup_mats("ExpSkiff_", [
        ("Hull", "7b5545", .42, .68, False, 0),
        ("Dark", "293538", .64, .61, False, 0),
        ("Steel", "9aa29e", .85, .34, False, 0),
        ("Rubber", "1b2426", .06, .92, False, 0),
        ("Canvas", "50524b", .03, .87, False, 0),
        ("Glass", "8fb9b8", .08, .15, True, 0),
        ("Ochre", "b7843f", .28, .68, False, 0),
    ])
    mats.update({key.lower(): value for key, value in list(mats.items())})
    root = exp_hs.empty("MMF_RaiderSkiff", (0, 0, 0))
    root["graphicsVersion"] = "graphics-v2-industrial"
    root["boundsContract"] = "x:-1.55..1.55,z:-2.9..2.7,deckY=1.2"
    root["crewSeats"] = "(-.59,1.2,.35),(.59,1.2,.35)"
    root["pilotSeat"] = "(0,1.2,-1.45)"
    body = exp_module("Skiff_FormedBody", root)
    tracks = exp_module("Skiff_TrackCasings", root)
    engine = exp_module("Skiff_Engine", root)
    cockpit = exp_module("Skiff_Cockpit", root)
    gun_module = exp_module("Skiff_MountedGun", root)

    # Rounded lower hull stays inside the original approximately 3.1 x 5.6m
    # envelope; the deck's top plane remains exactly at Y=1.2.
    exp_hs.box("Formed lower hull", (0, .73, .05), (2.08, .95, 4.85), mats["Hull"], body, .18)
    exp_hs.box("Raised prow", (0, .94, -2.38), (1.68, .58, .86), mats["Hull"], body, .16)
    exp_hs.box("Prow impact plate", (0, .89, -2.83), (1.18, .34, .22), mats["Ochre"], body, .07)
    exp_hs.box("Deck plate", (0, 1.16, .05), (1.84, .08, 4.56), mats["Dark"], body, .018)
    for z in (-1.95, -1.3, -.65, 0, .65, 1.3, 1.95):
        exp_hs.box(f"Deck bolt rail {z}", (0, 1.215, z), (1.62, .026, .025), mats["Steel"], body, .006)
        for x in (-.72, -.36, 0, .36, .72):
            exp_hs.screw(f"Deck fastener {x}_{z}", (x, 1.24, z), mats["Steel"], body, .010)

    # Two formed track casings, hubs and cleats provide a manufactured silhouette.
    for side in (-1, 1):
        x = side * 1.20
        exp_hs.box(f"Track formed casing {side}", (x, .60, .04), (.54, .86, 4.72), mats["Dark"], tracks, .16)
        exp_hs.box(f"Track upper guard {side}", (x, 1.00, -.03), (.60, .15, 4.88), mats["Hull"], tracks, .07)
        for z in (-2.05, -1.52, -.98, -.44, .10, .64, 1.18, 1.72, 2.25):
            exp_hs.cyl(f"Road wheel {side}_{z}", (side * 1.10, .53, z), (side * 1.47, .53, z), .27, mats["Rubber"], tracks, 32, .008)
            exp_hs.torus(f"Wheel hub ring {side}_{z}", (side * 1.49, .53, z), .12, .022, mats["Steel"], tracks, "x", 32, 8)
            exp_hs.cyl(f"Wheel hub {side}_{z}", (side * 1.49, .53, z), (side * 1.53, .53, z), .075, mats["Steel"], tracks, 24, .005)
        for i in range(24):
            z = -2.22 + i * .19
            exp_hs.box(f"Track cleat {side}_{i:02d}", (x, .12, z), (.55, .075, .055), mats["Steel"], tracks, .008)
        exp_hs.box(f"Track service panel {side}", (side * 1.49, .64, -.45), (.028, .40, 1.05), mats["Ochre"], tracks, .014)
        for z in (-.75, -.45, -.15):
            exp_hs.screw(f"Track panel bolt {side}_{z}", (side * 1.52, .64, z), mats["Steel"], tracks, .012)
        for z in (-1.7, 1.65):
            exp_hs.cyl(f"Track rail {side}_{z}", (side * .96, 1.32, z), (side * .96, 1.68, z), .035, mats["Steel"], tracks, 20, .004)

    # Engine bay aft: vents, exhaust and pipework are visible above the hull.
    exp_hs.box("Aft engine cowling", (0, 1.52, 2.02), (1.62, .68, .92), mats["Hull"], engine, .09)
    for x in (-.58, -.38, -.18, .02, .22, .42, .62):
        exp_hs.box(f"Engine louvre {x}", (x, 1.88, 2.03), (.065, .035, .67), mats["Dark"], engine, .009)
    for side in (-1, 1):
        exp_hs.cyl(f"Exhaust riser {side}", (side * .58, 1.65, 2.22), (side * .58, 2.42, 2.22), .07, mats["Dark"], engine, 28, .006)
        exp_hs.torus(f"Exhaust collar {side}", (side * .58, 2.12, 2.22), .08, .012, mats["Steel"], engine, "z", 28, 7)
        exp_hs.cyl(f"Exhaust cap {side}", (side * .58, 2.4, 2.22), (side * .58, 2.48, 2.22), .11, mats["Steel"], engine, 28, .006)
    exp_hs.curve("Engine coolant pipe", [(-.62, 1.37, 1.55), (-.82, 1.75, 1.35), (-.62, 2.05, 1.88)], .035, mats["Steel"], engine)
    exp_hs.curve("Engine fuel pipe", [(.62, 1.37, 1.55), (.84, 1.72, 1.40), (.62, 2.02, 1.86)], .032, mats["Ochre"], engine)
    for x in (-.55, -.18, .18, .55):
        exp_hs.box(f"Engine hatch fastener {x}", (x, 1.89, 1.63), (.035, .035, .035), mats["Steel"], engine, .008)

    # Cockpit details preserve all three seat points while keeping controls low.
    exp_hs.box("Pilot seat cushion", (0, 1.27, -1.45), (.60, .18, .54), mats["Canvas"], cockpit, .045)
    exp_hs.box("Pilot seat back", (0, 1.55, -1.17), (.58, .65, .16), mats["Canvas"], cockpit, .035)
    exp_hs.box("Control console", (0, 1.70, -2.0), (.78, .48, .31), mats["Hull"], cockpit, .05)
    exp_hs.box("Console glass", (0, 1.89, -1.83), (.30, .12, .025), mats["Glass"], cockpit, .008)
    for side in (-1, 1):
        exp_hs.cyl(f"Control handle {side}", (side * .23, 1.59, -1.77), (side * .23, 1.81, -1.77), .035, mats["Rubber"], cockpit, 24, .004)
    for side in (-1, 1):
        exp_hs.cyl(f"Boarding rail {side}", (side * .90, 1.22, -1.02), (side * .90, 1.74, 1.62), .035, mats["Steel"], cockpit, 24, .005)
        for z in (-.8, .1, 1.0):
            exp_hs.cyl(f"Rail stanchion {side}_{z}", (side * .90, 1.18, z), (side * .90, 1.72, z), .032, mats["Dark"], cockpit, 20, .004)
    for side in (-1, 1):
        exp_hs.box(f"Headlamp cage {side}", (side * .58, 1.16, -2.53), (.30, .28, .23), mats["Dark"], cockpit, .035)
        exp_hs.box(f"Headlamp glass {side}", (side * .58, 1.16, -2.66), (.20, .15, .025), mats["Glass"], cockpit, .009)
    exp_hs.box("Rear lashdown crate L", (-.38, 1.42, 1.30), (.42, .40, .54), mats["Canvas"], cockpit, .035)
    exp_hs.box("Rear lashdown crate R", (.38, 1.42, 1.30), (.42, .40, .54), mats["Canvas"], cockpit, .035)
    for side in (-1, 1):
        exp_hs.box(f"Crate strap {side}", (side * .38, 1.64, 1.30), (.06, .018, .54), mats["Dark"], cockpit, .004)

    # Exact authored seat anchors are empty nodes in root local space.
    left = exp_hs.empty("CrewSeatLeft", (-.59, 1.2, .35), root)
    right = exp_hs.empty("CrewSeatRight", (.59, 1.2, .35), root)
    pilot = exp_hs.empty("PilotSeat", (0, 1.2, -1.45), root)
    for seat, label in ((left, "Left"), (right, "Right"), (pilot, "Pilot")):
        seat["seatType"] = label
        exp_hs.box(f"{label} seat mount", (seat.location.x, 1.205, seat.location.y * -1), (.24, .035, .24), mats["Steel"], cockpit, .008)

    skiff_weapon(gun_module, mats)
    exp_hs.join_static()
    exp_hs.uv_all()
    return root


def export_expedition(stem: str, factory):
    exp_hs.clear()
    root = factory()
    bpy.context.scene["graphicsVersion"] = "graphics-v2-industrial"
    bpy.context.scene["assetStem"] = stem
    bpy.context.scene["source"] = "Original Machine Move Forward authored expedition geometry"
    bpy.context.view_layer.update()
    out = STAGE / (stem + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=str(out), export_format="GLB", use_selection=False,
        export_apply=True, export_texcoords=True, export_normals=True,
        export_materials="EXPORT", export_yup=True, export_extras=True,
        export_cameras=False, export_lights=False,
    )
    source = SOURCE / (stem + ".blend")
    bpy.ops.wm.save_as_mainfile(filepath=str(source))
    triangles = sum(sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)
                    for obj in bpy.context.scene.objects if obj.type == "MESH")
    meshes = sum(obj.type == "MESH" for obj in bpy.context.scene.objects)
    game_min = [float("inf")] * 3
    game_max = [float("-inf")] * 3
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            p = obj.matrix_world @ Vector(corner)
            game_point = (p.x, p.z, -p.y)
            for axis in range(3):
                game_min[axis] = min(game_min[axis], game_point[axis])
                game_max[axis] = max(game_max[axis], game_point[axis])
    expected_nodes = (
        ["Gangway", "CourseGyro", "JournalCargo", "JournalCrew", "JournalRoute"]
        if stem == "expedition-wreck"
        else ["SkiffGunYaw", "SkiffGunPitch", "SkiffMuzzle", "CrewSeatLeft", "CrewSeatRight", "PilotSeat"]
    )
    return {
        "asset": stem,
        "glb": str(out),
        "source": str(source),
        "triangles": triangles,
        "meshes": meshes,
        "bytes": out.stat().st_size,
        "boundsGame": {
            "min": [round(value, 4) for value in game_min],
            "max": [round(value, 4) for value in game_max],
        },
        "requiredNodes": {name: bpy.context.scene.objects.get(name) is not None for name in expected_nodes},
    }


def main():
    manifest = [
        export_expedition("expedition-wreck", expedition_wreck),
        export_expedition("raider-skiff", expedition_skiff),
    ]
    (STAGE / "expedition-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print("MMF_GRAPHICS_V2_EXPEDITION", json.dumps(manifest))


if __name__ == "__main__":
    main()

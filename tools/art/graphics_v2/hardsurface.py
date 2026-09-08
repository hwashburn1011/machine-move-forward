"""Industrial hard-surface art batch for MachineMoveForward graphics-v2.

This is intentionally collection-scoped and runs in an isolated Blender process.
It creates four authored GLBs with UVs and packed image maps.  The maps are made
in Blender as raster images and packed into the GLBs; no procedural shader nodes
are required at load time.

Run from the repository root:
  blender --background --factory-startup --python tools/art/graphics_v2/hardsurface.py
"""
import bpy
import math
import json
import random
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
STAGE = ROOT / "assets" / "graphics-v2" / "staging"
SOURCE = ROOT / "assets" / "blender" / "graphics-v2"
STAGE.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)

# Game coordinates are x/right, y/up, z/forward. Blender's exporter turns this
# into glTF Y-up; retaining the established x,-z,y helper matches the original
# authored files and Three.js interaction anchors.
def gv(p):
    return Vector((p[0], -p[2], p[1]))


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                       bpy.data.cameras, bpy.data.lights):
        for d in list(datablocks):
            if d.users == 0:
                datablocks.remove(d)


def rgba_hex(hex_color):
    h = hex_color.lstrip("#")
    return tuple(int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4)) + (1.0,)


def make_map(name, color, channel="base", size=1024, seed=1, metal=.5, rough=.6):
    """Make a small, packed, deterministic raster map for GLB embedding."""
    img = bpy.data.images.get(name) or bpy.data.images.new(name, width=size, height=size)
    img.generated_color = rgba_hex(color)
    rng=np.random.default_rng(seed)
    v,u=np.mgrid[0:size,0:size]/size
    grain=rng.random((size,size))
    cloud=(np.sin(u*math.tau*3+.7*np.sin(v*math.tau*2))+np.cos(v*math.tau*4+np.sin(u*math.tau*3)))*.25+.5
    streak=np.maximum(0,np.sin(u*math.tau*39+.2*np.sin(v*math.tau*4)))**80
    # Irregular coating variation, sparse directional scratches, and restrained
    # pits. Never a modulo pattern, which aliases into a woven metal surface.
    pix=np.ones((size,size,4),dtype=np.float32)
    base=np.asarray(rgba_hex(color)[:3])
    if channel=='base':
        stain=.88+.1*cloud+.035*grain-.035*streak
        pix[:,:,:3]=np.clip(stain[:,:,None]*base,0,1)
    elif channel=='normal':
        pix[:,:,0]=.5+(grain-.5)*.009+streak*.004
        pix[:,:,1]=.5+(rng.random((size,size))-.5)*.009
        pix[:,:,2]=1
    else:
        pix[:,:,0]=1
        pix[:,:,1]=np.clip(rough+(cloud-.5)*.16+(grain-.5)*.05,.08,.98)
        pix[:,:,2]=metal
    img.colorspace_settings.name = "Non-Color" if channel != "base" else "sRGB"
    img.pixels.foreach_set(pix.ravel())
    img.pack()
    return img


def material(name, color, metal=.4, rough=.65, glass=False, glow=0.0, seed=1):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bs = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bs.inputs["Metallic"].default_value = metal
    bs.inputs["Roughness"].default_value = rough
    if glass:
        bs.inputs["Metallic"].default_value = .1
        bs.inputs["Roughness"].default_value = .18
        bs.inputs["Transmission Weight"].default_value = .22
        bs.inputs["Alpha"].default_value = .82
        m.surface_render_method = 'DITHERED'
    base = nt.nodes.new("ShaderNodeTexImage")
    base.image = make_map(name + "_BaseColor", color, "base", seed=seed)
    norm = nt.nodes.new("ShaderNodeTexImage")
    norm.image = make_map(name + "_Normal", "8080ff", "normal", seed=seed+11)
    orm = nt.nodes.new("ShaderNodeTexImage")
    orm.image = make_map(name + "_ORM", "808080", "orm", seed=seed+23, metal=metal, rough=rough)
    normal = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(base.outputs["Color"], bs.inputs["Base Color"])
    nt.links.new(norm.outputs["Color"], normal.inputs["Color"])
    nt.links.new(normal.outputs["Normal"], bs.inputs["Normal"])
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    sep.mode = 'RGB'
    nt.links.new(orm.outputs["Color"], sep.inputs["Color"])
    # ORM is a real packed image: AO in R, roughness in G, metalness in B.
    nt.links.new(sep.outputs[1], bs.inputs["Roughness"])
    nt.links.new(sep.outputs[2], bs.inputs["Metallic"])
    if glow:
        bs.inputs["Emission Color"].default_value = rgba_hex(color)
        bs.inputs["Emission Strength"].default_value = glow
    nt.links.new(bs.outputs[0], out.inputs[0])
    m.diffuse_color = rgba_hex(color)
    return m


def empty(name, at=(0, 0, 0), parent=None):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.location = gv(at)
    if parent:
        o.parent = parent
    return o


def finish(o, name, mat, parent=None, bevel=0.0, smooth=False):
    o.name = name
    if mat:
        o.data.materials.append(mat)
    # Tiny fasteners and etched bars retain crisp geometry without a costly
    # modifier; formed housings use the full four-segment rolled edge.
    if bevel > .004:
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        mod = o.modifiers.new("Rolled edge", "BEVEL")
        mod.width, mod.segments, mod.limit_method = bevel, 4, 'ANGLE'
        bpy.ops.object.modifier_apply(modifier=mod.name)
        for p in o.data.polygons: p.use_smooth=True
        weighted=o.modifiers.new('Weighted face normals','WEIGHTED_NORMAL')
        weighted.keep_sharp=True
        bpy.ops.object.modifier_apply(modifier=weighted.name)
        o.select_set(False)
    if smooth and hasattr(o.data, "polygons"):
        for p in o.data.polygons:
            p.use_smooth = True
    if parent:
        world = o.matrix_world.copy()
        o.parent = parent
        o.matrix_world = world
    return o


def box(name, at, size, mat, parent=None, bevel=.018):
    bpy.ops.mesh.primitive_cube_add(size=1, location=gv(at))
    o = bpy.context.object
    o.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, name, mat, parent, bevel)


def cyl(name, a, b, radius, mat, parent=None, verts=32, bevel=0.0):
    av, bv = gv(a), gv(b)
    d = bv-av
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=d.length,
                                        end_fill_type='NGON', location=(av+bv)/2)
    o = bpy.context.object
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = d.to_track_quat('Z', 'Y')
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, name, mat, parent, bevel, smooth=True)


def torus(name, at, major, minor, mat, parent=None, axis='y', verts=32, segs=8):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     major_segments=verts, minor_segments=segs,
                                     location=gv(at))
    o = bpy.context.object
    # Blender torus starts normal to Z; game Y-up becomes Blender Z here.
    if axis == 'z':
        o.rotation_euler[0] = math.pi / 2
    elif axis == 'x':
        o.rotation_euler[1] = math.pi / 2
    return finish(o, name, mat, parent, 0, smooth=True)


def curve(name, points, radius, mat, parent=None):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions, cu.resolution_u, cu.bevel_resolution = '3D', 8, 3
    cu.bevel_depth, cu.resolution_u, cu.resolution_v = radius, 4, 1
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(points)-1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = gv(p)
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    o = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    o.select_set(False)
    # Spline control points are in world space, as are box/cylinder helpers.
    # Attach only after conversion and preserve the world transform.
    return finish(o, name, mat, parent, 0, smooth=True)


def screw(name, at, mat, parent=None, radius=.014):
    cyl(name, at, (at[0], at[1]+.018, at[2]), radius, mat, parent, verts=8, bevel=0)


def text_label(name, text, at, size, mat, parent=None):
    d = bpy.data.curves.new(name, 'FONT')
    d.body, d.align_x, d.size, d.extrude = text, 'CENTER', size, .0005
    d.resolution_u, d.resolution_v = 2, 0
    o = bpy.data.objects.new(name, d)
    bpy.context.collection.objects.link(o)
    o.location = gv(at)
    # Front panel is game -Z, equivalent to Blender +Y after glTF conversion.
    o.rotation_euler = (math.pi/2, 0, math.pi)
    d.materials.append(mat)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    o.select_set(False)
    if parent:
        o.parent = parent
    return o


def uv_all():
    for o in bpy.context.scene.objects:
        if o.type != 'MESH' or not o.data.uv_layers:
            if o.type == 'MESH':
                o.data.uv_layers.new(name='UVMap')
        if o.type == 'MESH':
            bpy.context.view_layer.objects.active = o
            o.select_set(True)
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.uv.smart_project(island_margin=.025, area_weight=0.3)
            bpy.ops.object.mode_set(mode='OBJECT')
            o.select_set(False)


def join_static():
    groups = {}
    for o in list(bpy.context.scene.objects):
        if o.type == 'MESH':
            groups.setdefault(o.parent, []).append(o)
    for parent, meshes in groups.items():
        if len(meshes) < 2:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in meshes:
            o.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
        meshes[0].name = (parent.name if parent else 'Asset') + '_Geometry'


def setup_mats(prefix, defs):
    return {name: material(prefix + name, color, metal, rough, glass, glow, i+1)
            for i, (name, color, metal, rough, glass, glow) in enumerate(defs)}


def radio():
    M = setup_mats('Radio_', [
        ('Paint', '657669', .48, .64, False, 0), ('Dark', '252f32', .62, .56, False, 0),
        ('Steel', '9aa4a3', .82, .34, False, 0), ('Rubber', '1c2223', .08, .91, False, 0),
        ('Glass', '8fb9b8', .08, .14, True, 0), ('Lamp', 'ffb34f', .08, .25, True, 2.4)])
    root = empty('MMF_SalvagedRadio')
    root['authoredPalette'] = True
    root['footprint'] = '1.16x.84m'; root['overallHeight'] = 1.88
    # Stand and pressed-metal receiver, with rolled lip and service seams.
    box('Bolted stand foot', (0,.055,0), (.58,.11,.42), M['Dark'], root, .035)
    box('Stand riser plate', (0,.19,0), (.34,.09,.27), M['Steel'], root, .022)
    cyl('Stand', (0,.14,0), (0,.84,0), .072, M['Steel'], root, 40, .006)
    torus('Stand collar', (0,.80,0), .11, .018, M['Dark'], root, 'y')
    box('Mounting tray', (0,.855,0), (.72,.07,.46), M['Dark'], root, .028)
    for x in (-.28,.28):
        for z in (-.16,.16): screw('Tray screw',(x,.90,z),M['Steel'],root,.022)
    box('Pressed receiver', (0,1.105,0), (.70,.43,.39), M['Paint'], root, .055)
    # Raised perimeter lip, inset face, and lower seam.
    box('Receiver top roll', (0,1.315,0), (.64,.035,.34), M['Paint'], root, .018)
    box('Receiver bottom roll', (0,.905,0), (.64,.035,.34), M['Paint'], root, .018)
    box('Inset black face', (0,1.10,-.218), (.615,.31,.025), M['Dark'], root, .022)
    box('Grille recess', (.13,1.035,-.238), (.28,.20,.012), M['Dark'], root, .014)
    for x in [0.025,.07,.115,.16,.205]:
        box('Grille bar',(x,1.035,-.249),(.014,.17,.010),M['Steel'],root,.004)
    # Glass dial with bezel, frequency tick marks and pointer.
    box('Dial bezel',(-.16,1.17,-.238),(.33,.105,.018),M['Steel'],root,.022)
    box('Dial glass',(-.16,1.17,-.251),(.295,.075,.009),M['Glass'],root,.012)
    for i in range(13):
        x = -.292 + i*.022
        box('Dial tick',(x,1.17,-.259),(.004,.026 if i%2 else .046,.004),M['Steel'],root,.001)
    box('Dial pointer',(-.11,1.17,-.264),(.009,.068,.005),M['Lamp'],root,.001)
    for x, r in [(.225,.058),(-.255,.028),(-.17,.028)]:
        cyl('Knurled control',(x,1.03,-.23),(x,1.03,-.276),r,M['Rubber'],root,36,.004)
        for a in range(12):
            ang = a*math.tau/12
            screw('Control grip',(x+math.cos(ang)*r*.72,1.03+math.sin(ang)*r*.72,-.283),M['Steel'],root,.004)
    text_label('Receiver label','RELAY / 07',(-.04,.948,-.241),.030,M['Steel'],root)
    text_label('Band label','SALVAGE',(.03,1.005,-.245),.018,M['Steel'],root)
    # Carry handle is a real curved tube, with strap keeper blocks.
    curve('Carry handle',[(-.28,1.26,0),(-.28,1.40,0),(-.17,1.46,0),(.17,1.46,0),(.28,1.40,0),(.28,1.26,0)],.019,M['Rubber'],root)
    for x in (-.25,.25): box('Handle keeper',(x,1.29,0),(.055,.12,.055),M['Steel'],root,.012)
    lamp = empty('SignalLamp',(.255,1.20,-.236),root)
    torus('Lamp bezel',(.255,1.20,-.247),.034,.008,M['Steel'],lamp,'z',32,8)
    box('Signal bulb',(.255,1.20,-.255),(.04,.04,.014),M['Lamp'],lamp,.009)
    # Aerial collar, spring section and whip reach exactly 1.88m.
    cyl('Antenna socket',(.26,1.29,.10),(.26,1.38,.10),.030,M['Rubber'],root,32,.005)
    torus('Aerial collar',(.26,1.35,.10),.038,.009,M['Steel'],root,'y',32,8)
    cyl('Aerial lower',(.26,1.37,.10),(.29,1.49,.10),.012,M['Steel'],root,24)
    curve('Whip antenna',[(.29,1.48,.10),(.30,1.66,.10),(.32,1.88,.10)],.009,M['Steel'],root)
    # Rear cable and panel screws sell the pressed construction.
    curve('Service cable',[(.31,.99,.10),(.48,.94,.10),(.55,.80,.13)],.012,M['Rubber'],root)
    for x in (-.29,.29):
        for z in (-.145,.145): screw('Case fastener',(x,1.135,z),M['Steel'],root,.014)
    join_static(); uv_all()
    return root


def weapon(stem, shotgun=False):
    M = setup_mats('Shot_' if shotgun else 'Rifle_', [
        ('Paint', '4d6965' if not shotgun else 'a27642', .42, .66, False, 0),
        ('Dark', '273234', .63, .57, False, 0), ('Steel', '9aa3a0', .84, .32, False, 0),
        ('Rubber', '1c2223', .08, .92, False, 0), ('Glass', '93babb', .08, .16, True, 0)])
    root = empty('MMF_' + stem)
    root['authoredPalette'], root['gripOrigin'], root['forwardAxis'] = True, True, '+Z'
    root['weaponLength'] = .95 if shotgun else .88
    empty('GripOrigin', (0,0,0), root)
    # Trigger guard and a properly curved pistol grip.
    box('Receiver',(0,.095,.16),(.19,.24,.38),M['Dark'],root,.035)
    box('Receiver top cover',(0,.235,.20),(.17,.045,.31),M['Paint'],root,.018)
    box('Rear stock pad',(0,.10,-.08),(.175,.19,.06),M['Rubber'],root,.020)
    curve('Pistol grip',[(0,.035,.02),(0,-.02,.06),(0,-.06,.15),(0,-.05,.24)],.060,M['Rubber'],root)
    box('Grip spine',(0,.015,.115),(.115,.15,.20),M['Paint'],root,.030)
    # Separate formed grip bands give the curved handle a tactile, repaired
    # construction and spend geometry where the held weapon is viewed close.
    for gy in (-.045, -.005, .035, .075, .115, .155):
        torus('Grip wrap',(0,gy,.13),.062,.010,M['Steel'],root,'y',32,8)
    for gz in (.045,.11,.175,.24):
        box('Receiver rib',(0,.265,gz),(.145,.014,.035),M['Paint'],root,.010)
    # Open trigger guard as an actual curved loop.
    curve('Trigger guard',[(-.07,.01,.10),(-.09,-.03,.02),(-.05,-.055,-.01),(.05,-.055,-.01),(.09,-.03,.02),(.07,.01,.10)],.012,M['Steel'],root)
    box('Trigger',(0,-.06,.085),(.018,.02,.06),M['Steel'],root,.006)
    length = .95 if shotgun else .88
    rad = .030 if shotgun else .020
    # Barrel bore uses two concentric cylinders with dark recess.
    cyl('Barrel',(0,.13,.29),(0,.13,length),rad,M['Steel'],root,40,.003)
    cyl('Bore',(0,.13,length-.034),(0,.13,length+.002),rad*.46,M['Dark'],root,32,.001)
    cyl('Muzzle sleeve',(0,.13,length-.07),(0,.13,length),rad*1.55,M['Dark'],root,40,.005)
    torus('Muzzle rim',(0,.13,length),rad*1.34,.008,M['Steel'],root,'z',40,8)
    box('Front sight',(0,.195,length-.10),(.028,.095,.028),M['Steel'],root,.006)
    box('Sight notch',(0,.218,.30),(.068,.028,.035),M['Dark'],root,.004)
    # Repeating top rail and fasteners.
    box('Top rail',(0,.27,.25),(.075,.035,.34),M['Steel'],root,.008)
    for z in [.06,.14,.22,.30,.38]: screw('Rail screw',(0,.298,z),M['Dark'],root,.008)
    if shotgun:
        cyl('Magazine tube',(0,.045,.28),(0,.045,.80),.028,M['Dark'],root,36,.004)
        box('Pump slide',(0,.055,.40),(.14,.13,.26),M['Paint'],root,.028)
        for z in [.30,.35,.40,.45,.50]:
            box('Pump rib',(0,.058,z),(.15,.14,.018),M['Rubber'],root,.004)
        for z in [.015,.08,.145]:
            cyl('Spare shell',(.10,.025,z),(.10,.14,z),.018,M['Paint'],root,16,.003)
        box('Shell latch',(.105,.086,.20),(.028,.10,.08),M['Steel'],root,.008)
    else:
        box('Heat shroud',(0,.13,.47),(.115,.13,.36),M['Paint'],root,.022)
        for z in [.31,.38,.45,.52,.59]:
            box('Shroud vent',(.059,.13,z),(.005,.055,.038),M['Dark'],root,.001)
            box('Shroud vent',(-.059,.13,z),(.005,.055,.038),M['Dark'],root,.001)
        box('Box magazine',(0,-.085,.19),(.10,.25,.14),M['Paint'],root,.023)
        box('Magazine heel',(0,-.215,.19),(.115,.025,.15),M['Dark'],root,.008)
        cyl('Gas piston',(0,.20,.48),(0,.20,.75),.012,M['Dark'],root,20)
        torus('Gas collar',(0,.20,.75),.026,.006,M['Steel'],root,'z',24,6)
    # Recessed receiver fasteners and a small glass sight.
    for x in (-.075,.075):
        for z in (.04,.20,.32): screw('Receiver fastener',(x,.225,z),M['Steel'],root,.010)
    box('Sight housing',(0,.31,.12),(.095,.07,.12),M['Dark'],root,.012)
    box('Sight glass',(0,.348,.12),(.058,.012,.045),M['Glass'],root,.006)
    empty('Muzzle',(0,0,length),root)
    join_static(); uv_all()
    return root


def turret():
    M = setup_mats('Turret_', [
        ('Paint', '657669', .48, .64, False, 0), ('Dark', '283438', .63, .57, False, 0),
        ('Steel', '9aa3a0', .84, .32, False, 0), ('Rubber', '1c2223', .08, .92, False, 0),
        ('Glass', 'ffb044', .10, .18, True, 1.5)])
    root = empty('MMF_Turret'); root['authoredPalette'] = True
    # Deck bearing stack remains at the existing collision footprint.
    cyl('Deck fixing ring',(0,.03,0),(0,.16,0),.76,M['Dark'],root,48,.008)
    cyl('Bearing ring',(0,.16,0),(0,.25,0),.58,M['Steel'],root,48,.008)
    for r,y in [(.64,.18),(.54,.25)]: torus('Bearing race',(0,y,0),r,.025,M['Steel'],root,'y',48,12)
    cyl('Pedestal',(0,.25,0),(0,.85,0),.27,M['Paint'],root,40,.016)
    for s in (-1,1):
        box('Mounting outrigger',(s*.58,.085,0),(.38,.16,1.32),M['Paint'],root,.035)
        for z in (-.50,-.17,.17,.50): screw('Outrigger bolt',(s*.58,.18,z),M['Steel'],root,.028)
    yaw = empty('TurretYaw',(0,.85,0),root)
    cyl('Rotation collar',(0,.79,0),(0,.98,0),.39,M['Paint'],yaw,40,.009)
    torus('Yaw bearing',(0,.90,0),.32,.028,M['Steel'],yaw,'y',48,12)
    # pitch pivot deliberately retains local +Y=.35 as authored contract.
    pitch = empty('TurretPitch',(0,.35,0),yaw)
    for s in (-1,1):
        box('Trunnion cheek',(s*.35,1.18,0),(.17,.56,.50),M['Paint'],yaw,.042)
        cyl('Trunnion bearing',(s*.32,1.20,0),(s*.50,1.20,0),.15,M['Steel'],yaw,40,.006)
        torus('Trunnion race',(s*.42,1.20,0),.12,.017,M['Dark'],yaw,'x',40,10)
    # formed receiver, shields, service seam and vented cooling jacket.
    box('Receiver',(0,1.22,-.16),(.54,.38,.69),M['Dark'],pitch,.055)
    box('Receiver top cover',(0,1.45,-.16),(.58,.07,.67),M['Paint'],pitch,.023)
    box('Service hatch',(0,1.25,.205),(.27,.012,.30),M['Steel'],pitch,.018)
    for x in (-.11,.11):
        for z in (.10,.20): screw('Receiver screw',(x,1.265,z),M['Steel'],pitch,.011)
    cyl('Heavy barrel jacket',(0,1.22,-.40),(0,1.22,-1.05),.112,M['Dark'],pitch,48,.008)
    for z in (-.52,-.66,-.80,-.94):
        torus('Cooling band',(0,1.22,z),.114,.014,M['Steel'],pitch,'z',48,10)
    # Long slots in the jacket make the vents read at gameplay distance.
    for a in range(8):
        ang = a*math.tau/8
        x,z = math.cos(ang)*.082, -.74+math.sin(ang)*.082
        box('Jacket vent',(x,1.22,z),(.018,.20,.052),M['Dark'],pitch,.004)
    cyl('Barrel',(0,1.22,-1.00),(0,1.22,-1.30),.055,M['Steel'],pitch,40,.004)
    cyl('Barrel bore',(0,1.22,-1.30),(0,1.22,-1.405),.026,M['Dark'],pitch,32,.001)
    cyl('Muzzle brake',(0,1.22,-1.22),(0,1.22,-1.39),.088,M['Dark'],pitch,40,.006)
    torus('Muzzle crown',(0,1.22,-1.395),.073,.011,M['Steel'],pitch,'z',40,8)
    for s in (-1,1):
        box('Operator shield',(s*.50,1.33,-.45),(.37,.70,.10),M['Paint'],pitch,.035)
        box('Shield lower trim',(s*.50,1.03,-.50),(.38,.10,.022),M['Steel'],pitch,.005)
        for z in (-.70,-.45,-.20): screw('Shield fastener',(s*.50,1.37,z),M['Steel'],pitch,.013)
        curve('Rear grip',[(s*.22,1.10,.10),(s*.22,1.26,.18),(s*.22,1.39,.22)],.034,M['Rubber'],pitch)
    # Side feed drum, guards, sight and a cable/control cluster.
    cyl('Ammo drum',(.30,1.22,.02),(.56,1.22,.02),.25,M['Paint'],pitch,40,.008)
    torus('Drum rim',(.56,1.22,.02),.19,.018,M['Steel'],pitch,'x',40,10)
    cyl('Drum cap',(.56,1.22,.02),(.60,1.22,.02),.19,M['Dark'],pitch,36,.006)
    for z in (-.10,0,.10): box('Feed guide',(.43,1.30,z),(.12,.08,.025),M['Steel'],pitch,.004)
    box('Reflex sight',(0,1.52,-.15),(.15,.10,.23),M['Dark'],pitch,.018)
    box('Sight lens',(0,1.575,-.15),(.10,.015,.09),M['Glass'],pitch,.006)
    curve('Control cable',[(-.28,1.07,.23),(-.42,.98,.35),(-.55,.93,.30)],.016,M['Rubber'],pitch)
    empty('Muzzle',(0,0,-1.4),pitch)
    join_static(); uv_all()
    return root


def save_asset(stem, factory):
    clear()
    root = factory()
    bpy.context.scene["graphicsVersion"] = "graphics-v2-industrial"
    bpy.context.scene["assetStem"] = stem
    bpy.context.view_layer.update()
    # Export only this isolated scene. GLB embeds every packed raster image.
    out = STAGE / (stem + '.glb')
    bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=False,
                              export_apply=True, export_texcoords=True, export_normals=True,
                              export_materials='EXPORT', export_yup=True,
                              export_extras=True)
    source = SOURCE / (stem + '.blend')
    bpy.ops.wm.save_as_mainfile(filepath=str(source))
    tris = sum(sum(max(0, len(p.vertices)-2) for p in o.data.polygons)
               for o in bpy.context.scene.objects if o.type == 'MESH')
    bounds = [min((o.bound_box[i][j] for o in bpy.context.scene.objects if o.type=='MESH' for i in range(8)), default=0)
              for j in range(3)]
    return {'asset': stem, 'glb': str(out), 'source': str(source), 'triangles': tris,
            'meshes': sum(o.type=='MESH' for o in bpy.context.scene.objects),
            'materials': sorted({m.name for o in bpy.context.scene.objects if o.type=='MESH' for m in o.data.materials})}


def main():
    # Factory startup is supplied by the command line. The order is intentional
    # so the staged manifest makes review and selective integration easy.
    manifest = [
        save_asset('salvaged-radio', radio),
        save_asset('scrap-rifle', lambda: weapon('scrap-rifle', False)),
        save_asset('scrap-shotgun', lambda: weapon('scrap-shotgun', True)),
        save_asset('manual-turret', turret),
    ]
    (STAGE / 'hardsurface-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('MMF_GRAPHICS_V2_HARDSURFACE', json.dumps(manifest))


if __name__ == '__main__':
    main()

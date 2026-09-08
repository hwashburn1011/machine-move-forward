"""Original tailored desert characters with smooth lofts and blended deformation.

Isolated Blender process only. Retains the proven animation skeleton/hand frame
from the editable first pack, replaces all visible geometry, embeds PBR maps.
"""
import bpy
import math
import json
import sys
from pathlib import Path
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
STAGE = ROOT / 'assets/graphics-v2/staging'
SOURCE = ROOT / 'assets/blender/graphics-v2'
MAPS = ROOT / 'assets/graphics-v2/character-maps'
for path in (STAGE, SOURCE, MAPS):
    path.mkdir(parents=True, exist_ok=True)

def vec(p):
    return Vector((p[0], -p[2], p[1]))

def linear(v):
    return v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4

def rgb(value):
    return tuple(linear(int(value[n:n+2], 16) / 255) for n in (0, 2, 4))

def image(name, data, color=False):
    h, w = data.shape[:2]
    im = bpy.data.images.new(name, width=w, height=h, alpha=True)
    im.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(data, 0, 1)
    im.pixels.foreach_set(rgba.ravel())
    im.filepath_raw = str(MAPS / (name + '.png'))
    im.file_format = 'PNG'
    im.save()
    im.pack()
    return im

def surface_maps(kind, size=1024):
    rng = np.random.default_rng(813 if kind == 'cloth' else 193)
    v, u = np.mgrid[0:size, 0:size] / size
    noise = rng.random((size, size))
    macro = .5 + .2 * np.sin(u*math.tau*3) * np.cos(v*math.tau*5)
    if kind == 'cloth':
        weave = np.sin(u*math.tau*128) * np.sin(v*math.tau*128)
        diagonal = np.sin((u+v)*math.tau*64)
        height = .006*weave + .002*diagonal + .0007*noise
        value = .78 + .09*macro + .035*weave + .018*noise
        rough = .82 + .1*noise
        metallic = np.zeros_like(u)
    elif kind == 'metal':
        scratches = np.maximum(0, np.sin(u*math.tau*73 + .15*np.sin(v*math.tau*2)))**40
        height = .0006*noise - .0014*scratches
        value = .78 + .1*macro + .03*noise - .04*scratches
        rough = .38 + .17*noise + .14*macro
        metallic = np.ones_like(u)*.78
    else:
        grain = np.sin(u*math.tau*90)*np.sin(v*math.tau*70)
        height = .001*noise + .001*grain
        value = .84 + .055*noise
        rough = .77 + .14*noise
        metallic = np.zeros_like(u)
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1))*18
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0))*18
    normal = np.stack([-dx, -dy, np.ones_like(dx)], axis=2)
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    return (image(kind+'_color', np.repeat(value[:, :, None], 3, axis=2), True),
            image(kind+'_normal', normal*.5+.5),
            image(kind+'_orm', np.stack([np.ones_like(u), rough, metallic], axis=2)))

def material(name, color, maps, metal=0, rough=1, glow=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*rgb(color), 1)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*rgb(color), 1)
    shader.inputs['Roughness'].default_value = rough
    shader.inputs['Metallic'].default_value = metal
    if maps:
        # Bake the garment color into its image: arbitrary MixRGB graphs are
        # not a portable glTF material contract.
        base = np.asarray(maps[0].pixels[:], dtype=np.float32).reshape(maps[0].size[1],maps[0].size[0],4)[:,:,:3]
        tint = np.array([int(color[n:n+2],16)/255 for n in (0,2,4)],dtype=np.float32)
        tex = nodes.new('ShaderNodeTexImage'); tex.image = image(name+'_basecolor',base*tint,True)
        shader.inputs['Base Color'].default_value=(1,1,1,1)
        links.new(tex.outputs['Color'],shader.inputs['Base Color'])
        norm = nodes.new('ShaderNodeTexImage'); norm.image = maps[1]
        normal = nodes.new('ShaderNodeNormalMap'); normal.inputs['Strength'].default_value = .55
        links.new(norm.outputs['Color'], normal.inputs['Color']); links.new(normal.outputs['Normal'], shader.inputs['Normal'])
        arm = nodes.new('ShaderNodeTexImage'); arm.image = maps[2]
        sep = nodes.new('ShaderNodeSeparateColor'); links.new(arm.outputs['Color'], sep.inputs[0])
        links.new(sep.outputs['Green'], shader.inputs['Roughness'])
        if metal: links.new(sep.outputs['Blue'], shader.inputs['Metallic'])
    if glow:
        shader.inputs['Emission Color'].default_value = (*rgb(color), 1)
        shader.inputs['Emission Strength'].default_value = glow
    return mat

def apply_weights(obj, weight):
    for v in obj.data.vertices:
        p = obj.matrix_world @ v.co
        values = weight((p.x, p.z, -p.y)) if callable(weight) else {weight: 1}
        for bone, value in values.items():
            if value > 1e-5:
                group = obj.vertex_groups.get(bone) or obj.vertex_groups.new(name=bone)
                group.add([v.index], value, 'REPLACE')

def mesh(name, vertices, faces, mat, weight, uvs=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata([vec(p) for p in vertices], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for p in data.polygons: p.use_smooth = True
    if uvs:
        layer = data.uv_layers.new(name='UVMap')
        for face, coords in zip(data.polygons, uvs):
            for li, uv in zip(face.loop_indices, coords): layer.data[li].uv = uv
    apply_weights(obj, weight)
    return obj

def loft(name, rings, mat, weight, segments=32, folds=.0, phase=0):
    # Ring: centre X, elevation Y, centre Z, horizontal radius, front/back radius.
    vertices=[]; faces=[]; uvs=[]
    y0, y1 = rings[0][1], rings[-1][1]
    for j, (x,y,z,rx,rz) in enumerate(rings):
        for i in range(segments):
            a=math.tau*i/segments
            f = folds*(math.sin(y*73 + math.sin(a*3+phase)*1.6) + .35*math.cos(y*117+a*5))
            f *= math.sin(math.pi*j/(len(rings)-1))**2
            vertices.append((x+(rx+f)*math.cos(a),y,z+(rz+f)*math.sin(a)))
    for j in range(len(rings)-1):
        for i in range(segments):
            k=(i+1)%segments
            faces.append((j*segments+i,j*segments+k,(j+1)*segments+k,(j+1)*segments+i))
            v0=(rings[j][1]-y0)/(y1-y0); v1=(rings[j+1][1]-y0)/(y1-y0)
            uvs.append(((i/segments,v0),((i+1)/segments,v0),((i+1)/segments,v1),(i/segments,v1)))
    faces += [tuple(reversed(range(segments))), tuple((len(rings)-1)*segments+i for i in range(segments))]
    uvs += [tuple((.5+.48*math.cos(math.tau*i/segments),.5+.48*math.sin(math.tau*i/segments)) for i in reversed(range(segments))),
            tuple((.5+.48*math.cos(math.tau*i/segments),.5+.48*math.sin(math.tau*i/segments)) for i in range(segments))]
    return mesh(name,vertices,faces,mat,weight,uvs)

def rounded(name, at, size, mat, bone, bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1, location=vec(at))
    obj=bpy.context.object; obj.name=name; obj.dimensions=(size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod=obj.modifiers.new('Formed edge','BEVEL'); mod.width=bevel; mod.segments=4
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.append(mat)
    for p in obj.data.polygons: p.use_smooth=True
    mod=obj.modifiers.new('Panel normals','WEIGHTED_NORMAL'); mod.keep_sharp=True; mod.weight=50
    bpy.ops.object.modifier_apply(modifier=mod.name)
    apply_weights(obj,bone)
    return obj

def sphere(name, at, scale, mat, bone, segments=32, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=vec(at))
    obj=bpy.context.object; obj.name=name; obj.scale=(scale[0],scale[2],scale[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.data.materials.append(mat)
    for p in obj.data.polygons:p.use_smooth=True
    apply_weights(obj,bone)
    return obj

def tube(name, points, radius, mat, bone, resolution=6):
    curve=bpy.data.curves.new(name,'CURVE'); curve.dimensions='3D'; curve.resolution_u=12
    spline=curve.splines.new('BEZIER'); spline.bezier_points.add(len(points)-1)
    for p,at in zip(spline.bezier_points,points):
        p.co=vec(at);p.handle_left_type=p.handle_right_type='AUTO'
    curve.bevel_depth=radius;curve.bevel_resolution=resolution
    obj=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.convert(target='MESH');obj=bpy.context.object;obj.data.materials.append(mat)
    for p in obj.data.polygons:p.use_smooth=True
    apply_weights(obj,bone);obj.select_set(False)
    return obj

def interpolate(a,b,x):
    t=max(0,min(1,x));t=t*t*(3-2*t)
    return {a:1-t,b:t}

def make_character(stem):
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/blender'/f'{stem}.blend'))
    rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
    root=rig.parent
    # Existing animation sources are retained, including the independent hand frame.
    rig.animation_data.action=None
    for b in rig.pose.bones:
        b.rotation_euler=(0,0,0);b.location=(0,0,0)
    for o in list(bpy.context.scene.objects):
        if o.type=='MESH':bpy.data.objects.remove(o,do_unlink=True)
    bpy.context.view_layer.update()
    cloth=surface_maps('cloth'); metal=surface_maps('metal'); rubber=surface_maps('rubber',512)
    player=stem=='player'; robot=stem=='scavenger'
    M={
        'cloth':material('V2_Canvas', 'baa989' if player else '847961',cloth),
        'jacket':material('V2_TailoredJacket', '3f6562' if player else '775846',cloth),
        'darkcloth':material('V2_DarkCanvas','3b4140',cloth),
        'paint':material('V2_CoatedArmor','627367' if robot else ('31514f' if player else '804735'),metal),
        'steel':material('V2_BareSteel','82918d',metal,.85),
        'rubber':material('V2_Rubber','242d2d',rubber),
        'leather':material('V2_Leather','504c40',rubber),
        'lens':material('V2_Optic','52776f' if player else 'ad5939',None,.15,.18,.12),
    }
    torso=lambda p:interpolate('Hips','Spine',(p[1]-1.06)/.18)
    if not robot:
        loft('Tailored torso',[(0,y,z,rx,rz) for y,z,rx,rz in [
            (1.025,0,.19,.128),(1.055,0,.205,.145),(1.10,0,.20,.15),(1.16,-.006,.184,.145),
            (1.22,-.005,.207,.157),(1.30,0,.232,.166),(1.38,0,.251,.17),(1.44,0,.26,.159),
            (1.49,-.007,.235,.145),(1.52,-.015,.196,.121),(1.55,-.02,.125,.099)]],M['jacket'],torso,40,.0028)
        loft('Trouser waist',[(0,.94,0,.187,.132),(0,.98,0,.212,.141),(0,1.035,0,.206,.14),
                             (0,1.08,0,.197,.13)],M['cloth'],'Hips',40,.0015)
        # Sculpted helmet: domed crown, narrowed cheeks and a distinct rolled brim.
        loft('Helmet crown',[(0,1.64,-.011,.119,.128),(0,1.69,-.008,.151,.15),
            (0,1.77,-.013,.158,.154),(0,1.82,-.016,.141,.139),(0,1.86,-.02,.095,.105),
            (0,1.879,-.02,.015,.018)],M['cloth'] if player else M['paint'],'Head',48)
        tube('Helmet rolled brim',[(-.143,1.722,.06),(-.11,1.737,.151),(0,1.742,.176),(.11,1.737,.151),(.143,1.722,.06)],.009,M['rubber'],'Head')
        for sign in (-1,1):
            rounded('Goggle frame',(sign*.071,1.742,.151),(.132,.075,.039),M['rubber'],'Head',.025)
            rounded('Curved lens',(sign*.071,1.743,.174),(.102,.05,.012),M['lens'],'Head',.016)
            sphere('Ear pad',(sign*.148,1.705,-.007),(.025,.058,.046),M['leather'],'Head',24,12)
            tube('Chin strap',[(sign*.134,1.71,.052),(sign*.116,1.64,.119),(sign*.055,1.605,.125)],.008,M['leather'],'Head',3)
        sphere('Respirator',(0,1.646,.146),(.098,.057,.055),M['rubber'],'Head',32,14)
        for sign in (-1,1):
            sphere('Filter cartridge',(sign*.071,1.642,.188),(.035,.032,.024),M['steel'],'Head',24,12)
        loft('Layered collar',[(0,1.515,-.008,.129,.116),(0,1.545,-.008,.145,.12),
            (0,1.577,-.008,.137,.109),(0,1.6,-.008,.105,.085)],M['darkcloth'],'Head',40,.002)
    else:
        loft('Cast torso',[(0,1.04,0,.18,.13),(0,1.14,0,.22,.16),(0,1.36,0,.25,.18),
             (0,1.48,0,.24,.15),(0,1.54,0,.13,.09)],M['paint'],torso,40)
        sphere('Sensor housing',(0,1.72,0),(.161,.158,.158),M['paint'],'Head',40,20)
        rounded('Optic inset',(0,1.75,.146),(.275,.09,.055),M['rubber'],'Head',.028)
        rounded('Scanner',(0,1.75,.178),(.214,.037,.012),M['lens'],'Head',.015)
        rounded('Jaw housing',(0,1.627,.11),(.215,.096,.12),M['steel'],'Head',.027)

    # Continuous trouser legs with blended weights over hips, knees and cuffs.
    for suffix,sign in [('L',-1),('R',1)]:
        thigh,shin,foot='Thigh.'+suffix,'Shin.'+suffix,'Foot.'+suffix
        upper,fore,hand='UpperArm.'+suffix,'Forearm.'+suffix,'Hand.'+suffix
        def leg_weights(p,thigh=thigh,shin=shin,foot=foot):
            if p[1]>.925:return interpolate(thigh,'Hips',(p[1]-.925)/.11)
            if p[1]>.48:return interpolate(shin,thigh,(p[1]-.48)/.18)
            return interpolate(foot,shin,(p[1]-.20)/.08) if p[1]<.28 else {shin:1}
        loft('Articulated trouser '+suffix,[(sign*x,y,z,rx,rz) for x,y,z,rx,rz in [
            (.16,.23,0,.062,.073),(.16,.28,-.004,.066,.078),(.16,.34,-.005,.078,.089),
            (.16,.41,-.009,.085,.095),(.16,.49,-.004,.074,.085),(.16,.55,.009,.075,.086),
            (.16,.585,.015,.082,.091),(.16,.63,.003,.087,.10),(.16,.69,0,.097,.116),
            (.158,.77,-.007,.106,.133),(.145,.85,-.01,.118,.146),(.12,.925,-.009,.121,.142),
            (.108,.99,0,.121,.12)]],M['paint'] if robot else M['cloth'],leg_weights,36,.0036 if not robot else 0,sign)
        rounded('Formed kneepad '+suffix,(sign*.16,.578,.098),(.139,.15,.061),M['paint'],shin,.038)
        tube('Kneepad seam '+suffix,[(sign*.16-.055,.63,.13),(sign*.16,.65,.133),(sign*.16+.055,.63,.13)],.0025,M['steel'],shin,2)
        # Rounded boot upper, broad welt, tapered toe and visible lacing.
        loft('Leather boot upper '+suffix,[(sign*.16,.049,.064,.10,.164),(sign*.16,.084,.073,.102,.169),
            (sign*.16,.127,.064,.096,.158),(sign*.16,.169,.015,.077,.097),
            (sign*.16,.235,-.009,.071,.084),(sign*.16,.28,-.009,.067,.08)],M['leather'],foot,40,.001)
        loft('Sole welt '+suffix,[(sign*.16,.012,.065,.097,.166),(sign*.16,.024,.065,.108,.177),
            (sign*.16,.048,.065,.108,.177),(sign*.16,.057,.065,.102,.171)],M['rubber'],foot,40)
        for y,z in [(.115,.172),(.142,.143),(.174,.105),(.205,.074)]:
            tube('Boot lace '+suffix,[(sign*.16-.038,y,z),(sign*.16,y+.009,z+.008),(sign*.16+.038,y,z)],.0028,M['darkcloth'],foot,2)
        # Swept sleeve rings follow shoulder/elbow/wrist anatomy, with cloth folds.
        def arm_weights(p,upper=upper,fore=fore):
            return interpolate(fore,upper,(p[1]-1.08)/.17)
        loft('Jacket sleeve '+suffix,[(sign*x,y,z,rx,rz) for x,y,z,rx,rz in [
            (.40,.977,.044,.061,.068),(.398,1.005,.038,.063,.075),(.397,1.055,.025,.069,.085),
            (.39,1.105,.013,.076,.09),(.381,1.155,.005,.079,.091),(.375,1.19,0,.084,.095),
            (.365,1.24,0,.083,.096),(.35,1.30,-.008,.09,.105),(.33,1.37,-.012,.096,.113),
            (.303,1.435,-.007,.106,.12),(.285,1.478,0,.094,.10)]],M['paint'] if robot else M['jacket'],arm_weights,32,.0028 if not robot else 0,sign)
        loft('Glove cuff '+suffix,[(sign*.4,.953,.05,.061,.074),(sign*.4,.982,.044,.065,.077),
                                  (sign*.398,1.005,.04,.066,.076)],M['rubber'],fore,32)
        sphere('Glove palm '+suffix,(sign*.4,.915,.073),(.063,.074,.07),M['leather'],hand,28,16)
        sphere('Glove knuckles '+suffix,(sign*.4,.87,.086),(.060,.038,.06),M['rubber'],hand,28,12)
        sphere('Thumb '+suffix,(sign*.343,.918,.105),(.023,.047,.032),M['leather'],hand,24,12)
        for dx in [-.039,-.013,.013,.039]:
            tube('Finger seam '+suffix,[(sign*.4+dx,.89,.129),(sign*.4+dx,.855,.115)],.0016,M['rubber'],hand,2)
        if robot:
            for y in [.35,.41,.47]:
                rounded('Shin vent',(sign*.16,y,.094),(.09,.014,.012),M['rubber'],shin,.004)
            tube('Hydraulic hose',[(sign*.245,.84,-.02),(sign*.26,.63,-.04),(sign*.22,.4,-.065)],.014,M['rubber'],leg_weights,4)
        else:
            # Seams, tailored pockets, webbing and straps have depth, not printed rectangles.
            rounded('Cargo pocket '+suffix,(sign*.239,.802,.039),(.059,.18,.158),M['cloth'],thigh,.021)
            rounded('Cargo flap '+suffix,(sign*.269,.859,.039),(.014,.057,.166),M['jacket'],thigh,.012)
            tube('Outer trouser seam '+suffix,[(sign*.24,.46,.003),(sign*.25,.67,.002),(sign*.25,.83,.03)],.0023,M['darkcloth'],leg_weights,2)
            tube('Shoulder webbing '+suffix,[(sign*.146,1.09,.146),(sign*.16,1.3,.18),
                 (sign*.17,1.47,.137),(sign*.16,1.52,-.014),(sign*.14,1.43,-.15),(sign*.14,1.14,-.17)],.014,M['darkcloth'],'Spine',3)
            rounded('Harness buckle '+suffix,(sign*.15,1.275,.19),(.041,.058,.012),M['steel'],'Spine',.008)
            rounded('Chest pouch '+suffix,(sign*.09,1.37,.174),(.13,.14,.044),M['jacket'],'Spine',.02)
            rounded('Pouch flap '+suffix,(sign*.09,1.425,.199),(.135,.04,.012),M['cloth'],'Spine',.009)
    rounded('Belt buckle',(0,1.058,.148),(.07,.05,.025),M['steel'],'Hips',.007)
    loft('Woven utility belt',[(0,1.03,0,.214,.149),(0,1.085,0,.212,.147)],M['darkcloth'],'Hips',48)
    tube('Front zipper',[(0,1.09,.151),(0,1.27,.172),(0,1.44,.165),(0,1.53,.1)],.0032,M['steel'],'Spine',2)
    # Backpack is a shaped cloth volume with separate lid and tension straps.
    loft('Soft backpack',[(0,1.10,-.206,.134,.061),(0,1.14,-.232,.169,.10),
        (0,1.23,-.254,.18,.106),(0,1.37,-.244,.171,.095),(0,1.47,-.225,.155,.082),
        (0,1.50,-.208,.109,.059)],M['paint'] if robot else M['darkcloth'],'Spine',36,.002)
    for x in [-.105,.105]:
        tube('Pack compression strap',[(x,1.13,-.303),(x,1.27,-.364),(x,1.45,-.315)],.010,M['leather'],'Spine',3)
        rounded('Pack clasp',(x,1.28,-.369),(.035,.05,.016),M['steel'],'Spine',.007)
    if robot:
        for x in [-.09,0,.09]:
            tube('Power capsule',[(x,1.18,-.349),(x,1.39,-.339)],.031,M['paint'],'Spine',6)

    bpy.ops.object.select_all(action='DESELECT')
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    skin=bpy.context.object;skin.name=stem+'_TailoredSkin'
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    skin.parent=rig
    mod=skin.modifiers.new('Blended anatomy deformation','ARMATURE');mod.object=rig
    root['graphicsVersion']=2;root['authoredPalette']=True
    # Keep old clip timing but adapt foot-contact height to the new sole geometry.
    # Root correction on each existing key sample also leaves hand-frame axes intact.
    for action in list(bpy.data.actions):
        if action.name not in ['Idle','Walking','Running']:continue
        rig.animation_data.action=action
        for frame in range(0,int(action.frame_range[1])+1,2):
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()
            evaluated=skin.evaluated_get(bpy.context.evaluated_depsgraph_get())
            lowest=min((evaluated.matrix_world@v.co).z for v in evaluated.data.vertices)
            rig.pose.bones['Root'].location.y+=.018-lowest
            rig.pose.bones['Root'].keyframe_insert('location',frame=frame)
    rig.animation_data.action=None
    for bone in rig.pose.bones:bone.rotation_euler=(0,0,0);bone.location=(0,0,0)
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(stem+'.blend')))
    bpy.ops.export_scene.gltf(filepath=str(STAGE/(stem+'.glb')),export_format='GLB',export_yup=True,
        export_extras=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,
        export_skins=True,export_cameras=False,export_lights=False,
        export_copyright='Original Machine Move Forward graphics, authored in Blender')
    tris=sum(len(p.vertices)-2 for p in skin.data.polygons)
    print('V2_CHARACTER',json.dumps({'asset':stem,'triangles':tris,'bytes':(STAGE/(stem+'.glb')).stat().st_size}))

if __name__=='__main__':
    names=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['player','raider','scavenger']
    for stem in names:make_character(stem)

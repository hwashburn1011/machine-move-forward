"""Refine the retained component masters; never overwrite original art.

Blender --background --factory-startup --python this_file -- s07
Exports a skin on the existing gameplay rig; Godot retains the original animation graph.
"""
import bpy, bmesh, math, json, sys, numpy as np
from pathlib import Path
from mathutils import Matrix, Vector

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/native-character-refinement';OUT.mkdir(exist_ok=True)
sys.path.insert(0,str(ROOT/'tools/art/native_enemies'))
from repair_tangents import repair
from root_legacy_skin import root_skin
kind=sys.argv[sys.argv.index('--')+1]
hero=kind=='s07'
legacy=kind in ['raider','scavenger']
source=ROOT/('assets/gunner-s07/source/S07_Gunner.blend' if hero else f'assets/native-legacy-enemies/{kind}.blend' if legacy else f'assets/mech-enemies/source/{kind}.blend')
bpy.ops.wm.open_mainfile(filepath=str(source))
bpy.context.preferences.filepaths.save_version=0
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
rig.animation_data_clear();rig.data.pose_position='REST'
if not legacy:rig.scale=(1,1,1)
for bone in rig.pose.bones:bone.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()
parts=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.parent==rig]
keep=set(parts+[rig]+([rig.parent] if rig.parent else []))
for obj in list(bpy.context.scene.objects):
    if obj not in keep:bpy.data.objects.remove(obj,do_unlink=True)
report={'source':str(source.relative_to(ROOT)),'parts':len(parts),'rounded':[],'cloth':[],'textures':[]}

def select(obj):
    bpy.ops.object.select_all(action='DESELECT');obj.hide_set(False);obj.select_set(True);bpy.context.view_layer.objects.active=obj

def apply(obj,mod):
    select(obj);bpy.ops.object.modifier_apply(modifier=mod.name)

def bounds(obj):
    points=[v.co for v in obj.data.vertices]
    low=Vector(tuple(min(v[i] for v in points) for i in range(3)))
    high=Vector(tuple(max(v[i] for v in points) for i in range(3)))
    return (low+high)*.5,high-low

# Give chipped paint a quieter value range. Keep the original, uniquely authored
# wear, weave and UVs; normal/roughness detail remains independent of base color.
seen=set()
for mat in sorted({m for o in parts for m in o.data.materials if m},key=lambda m:m.name):
    if not mat.use_nodes:continue
    n=mat.name.lower();nodes=mat.node_tree.nodes;bs=next((x for x in nodes if x.type=='BSDF_PRINCIPLED'),None)
    painted=any(t in n for t in ['chippedarmor','fadedtan','black_enamel','olive enamel','oxide armor','armor paint'])
    metal=any(t in n for t in ['gunmetal','bevelsteel','steel','brass'])
    cloth=any(t in n for t in ['cloth','scarf','camouflage','canvas','webbing','leather'])
    for node in nodes:
        if node.type=='NORMAL_MAP':node.inputs['Strength'].default_value*=.42 if painted else .65
        if node.type!='TEX_IMAGE' or not node.image or node.image in seen:continue
        image=node.image
        links=[link.to_socket.name for link in node.outputs['Color'].links]
        is_base='Base Color' in links
        # The source masters feed packed ORM through Separate Color/RGB.
        is_orm=any(link.to_node.type in ['SEPRGB','SEPARATE_COLOR'] for link in node.outputs['Color'].links)
        if not (painted or metal or cloth) or not (is_base or is_orm):continue
        seen.add(image);pix=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(pix);a=pix.reshape(-1,4)
        if is_base:
            center=np.quantile(a[:,:3],.30 if painted else .50,axis=0)
            strength=.30 if painted else .60 if metal else .86
            a[:,:3]=center+(a[:,:3]-center)*strength
        else:
            a[:,1]=a[:,1]*.4+(.49 if painted else .38 if metal else .86)*.6
            if painted:a[:,2]*=.30
        image.pixels.foreach_set(pix);image.update()
        # Pack edited pixels into a new PNG; export must not use old packed bytes.
        target=OUT/'textures';target.mkdir(exist_ok=True)
        safe=''.join(c if c.isalnum() or c in '-_' else '_' for c in image.name)
        image.filepath_raw=str(target/(kind+'-'+safe+'.png'));image.file_format='PNG';image.save()
        if image.packed_file:image.unpack(method='REMOVE')
        image.reload();image.pack()
        report['textures'].append(image.name)
    if bs and any(t in n for t in ['cyan','violet','plasma']):bs.inputs['Emission Strength'].default_value=min(1.6,bs.inputs['Emission Strength'].default_value)
    if bs and 'visor' in n:
        bs.inputs['Base Color'].default_value=(.009,.022,.032,1);bs.inputs['Metallic'].default_value=.5;bs.inputs['Roughness'].default_value=.16

for part_index,obj in enumerate(parts):
    if part_index%100==0:print('REFINING',kind,part_index,len(parts),flush=True)
    for mod in list(obj.modifiers):obj.modifiers.remove(mod)
    # Retain the rig-relative coordinate frame, then work in metres.
    world=obj.matrix_world.copy();obj.parent=None;obj.matrix_world=world
    select(obj);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    name=obj.name.lower();center,size=bounds(obj)
    if hero:
        head=obj.vertex_groups.get('head')
        if head:
            for v in obj.data.vertices:
                if not any(g.group==head.index and g.weight>.5 for g in v.groups):continue
                if abs(v.co.x)>.155:v.co.x=math.copysign(.155+(abs(v.co.x)-.155)*.65,v.co.x)
                if v.co.y<-.14:v.co.y=-.14+(v.co.y+.14)*.80
        if 'pouch' in name:
            for v in obj.data.vertices:v.co.y=center.y+(v.co.y-center.y)*.86
    # Scale individual fasteners, leaving their mounting positions untouched.
    if any(t in name for t in ['bolt','rivet','fastener']):
        for v in obj.data.vertices:v.co=center+(v.co-center)*.78
    cloth=any(t in name for t in ['folded neck scarf','shoulder cloak','hip tabard','neck cowl fold','rear scarf tails','waist rag','coat front','coat side','coat skirt','front tabard','outer cape','burgundy lining','fitted field jacket','tailored trouser','combat sleeve','trousers tailored','neck wrap'])
    textile_surface=cloth or any(t in name for t in ['sleeve','gaiter','sculpted glove','anatomical torso','padded ammunition pouch'])
    lettering=name.startswith('marking') or any(t in name for t in ['stencil','identification lettering'])
    panel=not cloth and not lettering and any(t in name for t in ['shell','plate','housing','armor','mask','crown','cheek','greave','feather','shield','brow','boot','pouch']) and min(size)>.007
    if textile_surface:
        # Rejoin coplanar triangles on the legacy masters before subdivision.
        bm=bmesh.new();bm.from_mesh(obj.data)
        if all(len(f.verts)==3 for f in bm.faces):
            bmesh.ops.join_triangles(bm,faces=list(bm.faces),angle_face_threshold=.25,angle_shape_threshold=.7,cmp_uvs=True)
        bm.to_mesh(obj.data);bm.free()
        if sum(len(p.vertices)==4 for p in obj.data.polygons)>.45*len(obj.data.polygons):
            mod=obj.modifiers.new('Tailored continuous folds','SUBSURF');mod.levels=1;apply(obj,mod)
        mod=obj.modifiers.new('Relax cloth faceting','SMOOTH');mod.factor=.30;mod.iterations=2;apply(obj,mod)
        report['cloth'].append(obj.name)
    elif panel:
        mod=obj.modifiers.new('Machined radiused edges','BEVEL');mod.width=min(.0035,min(size)*.10);mod.segments=3;mod.limit_method='ANGLE';mod.angle_limit=.65;mod.use_clamp_overlap=True
        apply(obj,mod);report['rounded'].append(obj.name)
    # Planar glyph interiors and tiny hardware do not need the same budget as
    # rounded silhouettes or cloth. Avoid the old single whole-body reduction.
    if lettering:
        mod=obj.modifiers.new('Planar glyph optimization','DECIMATE');mod.decimate_type='DISSOLVE';mod.angle_limit=.06;apply(obj,mod)
    obj.data.calc_loop_triangles();tri=len(obj.data.loop_triangles)
    limit=8500 if textile_surface else 2000 if panel else 700 if lettering else 500
    if tri>limit:
        mod=obj.modifiers.new('Component detail budget','DECIMATE');mod.ratio=limit/tri;apply(obj,mod)
    for polygon in obj.data.polygons:polygon.use_smooth=True
    # Split actual fabricated corners, then weight broad panel normals. Curved
    # cloth remains continuous; smoothing does not turn planar armor into blobs.
    bm=bmesh.new();bm.from_mesh(obj.data)
    for edge in bm.edges:edge.smooth=textile_surface or len(edge.link_faces)!=2 or edge.calc_face_angle(0)<math.radians(48)
    bm.to_mesh(obj.data);bm.free();obj.data.update()
    if panel:
        mod=obj.modifiers.new('Broad panel surface normals','WEIGHTED_NORMAL');mod.keep_sharp=True;mod.weight=40;apply(obj,mod)
    obj.parent=rig;obj.matrix_world=Matrix.Identity(4)
    mod=obj.modifiers.new('Original skeletal deformation','ARMATURE');mod.object=rig

# Keep the new editable, named components for future art passes.
rig.data.pose_position='POSE'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(kind+'-components.blend')),compress=True)
(OUT/(kind+'-manifest.json')).write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')

exec(compile((Path(__file__).parent/'export.py').read_text(encoding='utf-8'),str(Path(__file__).parent/'export.py'),'exec'),dict(globals(),__name__='character_export'))

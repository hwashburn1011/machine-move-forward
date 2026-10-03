"""Assemble a navigable 100-model review; runtime files and masters are read-only.

blender --background --threads 4 --python tools/art/art100_gallery.py
Append -- --render for a physical-scale overview render. Small props have their
own cameras: they are intentionally never inflated to match building size.
"""
import bpy,json,math,hashlib,sys
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets/art100'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.length_unit='METERS'
legacy=json.loads((OUT/'legacy/manifest.json').read_text())
wasteland=json.loads((OUT/'wasteland/manifest.json').read_text())['models']
machine=json.loads((OUT/'machine/manifest.json').read_text())
story=json.loads((OUT/'story-robots/manifest.json').read_text())['models']
assert len(legacy)==len(wasteland)==len(machine)==len(story)==25
assert len([e for e in story if e['status']=='new'])==19
specs=[
 {'key':'legacy','title':'01  LEGACY REFINEMENTS — 25','ids':[e['id'] for e in legacy],
  'source':'assets/art100/legacy/Art100_DesertRefinement.blend','at':(0,0),'pitch':11.5},
 {'key':'wasteland','title':'02  WASTELAND — 25','ids':[e['id'] for e in wasteland],
  'source':'assets/art100/wasteland/art100-wasteland.blend','at':(77,0),'pitch':23.0},
 {'key':'machine','title':'03  MACHINE FURNISHINGS — 25','ids':list(machine),
  'source':'assets/art100/machine/NomadFurnishings.blend','at':(0,75),'pitch':4.0},
 {'key':'story-robots','title':'04  STORY & COMPLETE CHARACTERS — 25','ids':[e['id'] for e in story],
  'source':'assets/art100/story-robots/StoryRobots-editable.blend','at':(29,75),'pitch':5.0},
]
review=bpy.data.collections.new('00  REVIEW / lights, cameras and captions');scene.collection.children.link(review)
widgets=bpy.data.collections.new('RIG WIDGETS / hidden importer helpers, not model geometry');review.children.link(widgets)
widgets.hide_render=True;widgets.hide_viewport=True
def link_only(obj,coll):
    if obj.name not in coll.objects:coll.objects.link(obj)
    for old in list(obj.users_collection):
        if old!=coll:old.objects.unlink(obj)
def bounds(root):
    deps=bpy.context.evaluated_depsgraph_get();points=[]
    for obj in [root,*root.children_recursive]:
        if obj.type=='MESH' and not obj.get('art100_review_helper',False):
            ev=obj.evaluated_get(deps);points.extend(ev.matrix_world@Vector(p) for p in ev.bound_box)
    assert points,root.name
    return Vector(tuple(min(p[k] for p in points) for k in range(3))),Vector(tuple(max(p[k] for p in points) for k in range(3)))
def remove_tree(root):
    for ob in reversed([root,*root.children_recursive]):
        if ob.name in bpy.data.objects:bpy.data.objects.remove(ob,do_unlink=True)
def import_kit(file):
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(file))
    imported=set(bpy.data.objects)-before
    return {o.name:o for o in imported if o.parent not in imported}

# Runtime kits are compact visual assemblies. Complete enemy bodies come from
# the assembled source instead of miscounting their six attachment-only roots.
loaded={}
for spec in specs:
    loaded[spec['key']]=import_kit(ROOT/'godot/art'/f'art100-{spec["key"]}.glb')
for entry in story:
    if entry['status']=='refined':
        remove_tree(loaded['story-robots'].pop(entry['id']))
full_source=OUT/'story-robots/CompleteCharacterAssemblies.blend'
before=set(bpy.data.objects)
with bpy.data.libraries.load(str(full_source),link=False) as (src,dst):dst.objects=list(src.objects)
appended=set(bpy.data.objects)-before
complete_roots={o.name:o for o in appended if o.name.startswith('Complete_')}
assert len(complete_roots)==6
keep=set()
for entry in story:
    if entry['status']!='refined':continue
    expected=entry.get('complete_assembly_root','Complete_'+entry['id'])
    root=complete_roots[expected];hierarchy={root,*root.children_recursive};keep.update(hierarchy)
    assert any(o.type=='ARMATURE' for o in hierarchy),expected+' must include the existing body rig'
    meshes=[o for o in hierarchy if o.type=='MESH']
    assert len(meshes)>entry['runtime_meshes'],expected+' must include body plus authored kit'
    loaded['story-robots'][entry['id']]=root
for ob in appended-keep:bpy.data.objects.remove(ob,do_unlink=True)
# The glTF importer creates Icosphere custom-shape widgets for rig bones.
# The complete-character source retained these datablocks under its assemblies;
# they are not exported body meshes and must not obscure or ground a character.
bone_widgets={bone.custom_shape for ob in keep if ob.type=='ARMATURE' for bone in ob.pose.bones if bone.custom_shape}
for ob in bone_widgets:
    ob['art100_review_helper']=True;ob.hide_render=True;ob.hide_viewport=True;link_only(ob,widgets)

def simple_material(name,color,rough=1):
    m=bpy.data.materials.new(name);m.use_nodes=True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=rough
    return m
caption_mat=simple_material('Review caption ivory',(.62,.62,.50))
def caption(body,p,size,name):
    cu=bpy.data.curves.new(name,'FONT');cu.body=body;cu.size=size;cu.align_x='CENTER';cu.align_y='CENTER';cu.extrude=0
    ob=bpy.data.objects.new(name,cu);review.objects.link(ob);ob.location=p;ob.data.materials.append(caption_mat)
    return ob
records=[];cohort_boxes=[];sequence=0
for spec in specs:
    cohort=bpy.data.collections.new(spec['title']);scene.collection.children.link(cohort)
    cohort['whole_assembly_count']=25;cohort['source_editable']=str(ROOT/spec['source'])
    allpts=[]
    for index,model_id in enumerate(spec['ids']):
        sequence+=1;root=loaded[spec['key']][model_id]
        sub=bpy.data.collections.new(f'{sequence:03}  |  {model_id}');cohort.children.link(sub)
        hierarchy=[root,*root.children_recursive]
        for ob in hierarchy:link_only(ob,widgets if ob.get('art100_review_helper',False) else sub)
        bpy.context.view_layer.update();low,high=bounds(root)
        target=Vector((spec['at'][0]+index%5*spec['pitch'],spec['at'][1]+index//5*spec['pitch'],0))
        offset=Vector((target.x-(low.x+high.x)/2,target.y-(low.y+high.y)/2,-low.z))
        root.location+=offset;bpy.context.view_layer.update();low,high=bounds(root)
        assert abs(low.z)<.00001,(model_id,low.z)
        source=spec['source'];source_root=model_id;kind='Runtime visual assembly'
        if root.name.startswith('Complete_'):
            source='assets/art100/story-robots/CompleteCharacterAssemblies.blend';source_root=root.name;kind='Complete existing rigged body plus authored equipment'
        root['art100_model_id']=model_id;root['art100_index']=sequence;root['art100_counting_unit']='Whole assembly'
        root['source_editable']=str(ROOT/source);root['source_object']=source_root
        root['runtime_file']=str(ROOT/'godot/art'/f'art100-{spec["key"]}.glb')
        sub['model_id']=model_id;sub['review_index']=sequence;sub['source_editable']=str(ROOT/source);sub['source_object']=source_root
        sub['whole_assembly']=True
        triangles=0
        for ob in hierarchy:
            if ob.type=='MESH' and not ob.get('art100_review_helper',False):ob.data.calc_loop_triangles();triangles+=len(ob.data.loop_triangles)
        r={'index':sequence,'id':model_id,'cohort':spec['key'],'collection':sub.name,'root_object':root.name,
           'counting_unit':kind,'editable_source':source,'editable_source_object':source_root,
           'runtime_glb':f'godot/art/art100-{spec["key"]}.glb','mesh_objects':sum(o.type=='MESH' and not o.get('art100_review_helper',False) for o in hierarchy),
           'armatures':sum(o.type=='ARMATURE' for o in hierarchy),'triangles':triangles,
           'gallery_world_bounds_blender':{'min':list(low),'max':list(high)},
           'native_dimensions_m_godot':[high.x-low.x,high.z-low.z,high.y-low.y]}
        if root.name.startswith('Complete_'):
            r['runtime_body_and_attachment']=next(e['runtime_target'] for e in story if e['id']==model_id)
        records.append(r);allpts.extend([low,high])
        label=f'{sequence:03}  '+model_id
        label_size=min(.30,spec['pitch']*.046)
        caption(label,(target.x,target.y-spec['pitch']*.44,.012),label_size,f'Label {sequence:03}')
    lo=Vector(tuple(min(p[k] for p in allpts) for k in range(3)));hi=Vector(tuple(max(p[k] for p in allpts) for k in range(3)))
    cohort_boxes.append((spec,lo,hi))
    caption(spec['title'],((lo.x+hi.x)/2,lo.y-3.0,.015),.70 if spec['pitch']>10 else .45,'Cohort label '+spec['key'])

assert len(records)==100 and len(set(e['id'] for e in records))==100
assert sum(e['armatures']>0 for e in records)==6
assert len([e for e in records if e['root_object'].startswith('Complete_')])==6
assert not any(o.parent is None and o.name in [e['id'] for e in story if e['status']=='refined'] for o in bpy.data.objects)
assert all(len(c.children)==25 for c in scene.collection.children if c!=review)
for i,left in enumerate(records):
    for right in records[i+1:]:
        a=left['gallery_world_bounds_blender'];b=right['gallery_world_bounds_blender']
        assert not all(a['min'][k]<b['max'][k] and b['min'][k]<a['max'][k] for k in [0,1]),(left['id'],right['id'],'overlapping gallery footprints')

# A true metre-scale gallery with four useful close-up cameras and an overview.
alllo=Vector(tuple(min(r['gallery_world_bounds_blender']['min'][k] for r in records) for k in range(3)))
allhi=Vector(tuple(max(r['gallery_world_bounds_blender']['max'][k] for r in records) for k in range(3)))
ground_mat=simple_material('Review ground warm graphite',(.13,.14,.125))
bpy.ops.mesh.primitive_plane_add(size=300,location=((alllo.x+allhi.x)/2,(alllo.y+allhi.y)/2,-.025));ground=bpy.context.object
ground.name='REVIEW ONLY / metre-scale floor';ground.data.materials.append(ground_mat);link_only(ground,review)
def camera(name,low,high):
    center=(low+high)/2;span=max(high.x-low.x,(high.y-low.y)*1.30,(high.z-low.z)*1.5)
    data=bpy.data.cameras.new(name);ob=bpy.data.objects.new(name,data);review.objects.link(ob)
    ob.location=center+Vector((.38,-1,1.12)).normalized()*span*1.9
    ob.rotation_euler=(center-ob.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=span*1.23;data.clip_end=1000
    return ob
for spec,low,high in cohort_boxes:camera('Camera / '+spec['key'],low-Vector((2,3,0)),high+Vector((2,2,1)))
scene.camera=camera('Camera / ALL 100 / physical scale',alllo-Vector((4,5,0)),allhi+Vector((4,4,1)))
world=bpy.data.worlds.new('Review daylight');world.use_nodes=True;scene.world=world
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.50,.60,.70,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.8
sun_data=bpy.data.lights.new('Review sun','SUN');sun_data.energy=2.0;sun_data.angle=.16
sun=bpy.data.objects.new('Review sun',sun_data);review.objects.link(sun);sun.rotation_euler=(.35,-.50,-.40)
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16;scene.cycles.use_denoising=True
scene.render.resolution_x=1800;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
scene['ART100_whole_assembly_count']=100;scene['ART100_cohort_counts']='25 legacy + 25 wasteland + 25 machine + 19 story props + 6 complete characters'
scene['ART100_master_sources_preserved']=True;scene['ART100_native_units']='metres, ground plane Z=0 in Blender; Godot +Y up'
scene['ART100_navigation']='Expand a numbered cohort. Right-click a numbered model collection > Select Objects, then NumPad Period to frame the whole assembly. Camera choices include each cohort and physical-scale overview.'
readme=bpy.data.texts.new('START HERE — 100 whole assemblies')
readme.write('ART100 REVIEW\n\n100 whole model assemblies, at native metre scale.\n\n'+scene['ART100_navigation']+'\n\nSix enemy entries are COMPLETE retained bodies and rigs with fitted authored equipment; attachment-only exports are not counted separately.\n\nEvery numbered model collection and its root contains source_editable, source_object and runtime_file metadata. These review visuals are imported runtime meshes; original editable per-part masters are preserved at those source paths.\n\nSources:\n'+'\n'.join(str(ROOT/s['source']) for s in specs)+'\n'+str(full_source)+'\n')
bpy.ops.object.select_all(action='DESELECT')
for area in bpy.context.screen.areas if bpy.context.screen else []:
    if area.type=='VIEW_3D':
        area.spaces.active.shading.type='MATERIAL';area.spaces.active.clip_end=1000
        area.spaces.active.region_3d.view_perspective='CAMERA'
bpy.ops.file.pack_all()
audit={'whole_assembly_count':100,'cohorts':{s['key']:25 for s in specs},'complete_characters':6,'attachment_only_entries_counted':0,
       'hidden_rig_widgets_not_geometry':[o.name for o in bone_widgets],
       'grounded':True,'native_scale_preserved':True,'overlapping_gallery_footprints':0,'records':records,'runtime_sha256':{s['key']:hashlib.sha256((ROOT/'godot/art'/f'art100-{s["key"]}.glb').read_bytes()).hexdigest() for s in specs}}
(OUT/'gallery-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Art100Review.blend'),compress=True)
print('ART100_GALLERY_AUDIT',json.dumps({'count':len(records),'cohorts':audit['cohorts'],'complete_characters':6,'meshes':sum(r['mesh_objects'] for r in records),'triangles':sum(r['triangles'] for r in records),'names':[r['id'] for r in records]}),flush=True)
if '--render' in sys.argv:
    scene.render.filepath=str(OUT/'Art100Review-overview.png');bpy.ops.render.render(write_still=True)
    scene.camera=bpy.data.objects['Camera / story-robots']
    scene.render.filepath=str(OUT/'Art100Review-story-complete-characters.png');bpy.ops.render.render(write_still=True)

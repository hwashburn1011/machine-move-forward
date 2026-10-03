"""Fine palette pass on25 prior assemblies; one atlas/material draw per model.

Run with Blender only after the new100-model phase is complete. Geometry, source
components, decal UVs and the original normal/roughness maps are preserved.
"""
import bpy,json,math
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets/art200/legacy-touchup';OUT.mkdir(parents=True,exist_ok=True)
OLD=ROOT/'assets/art100/legacy'
bpy.ops.wm.open_mainfile(filepath=str(OLD/'Art100_DesertRefinement.blend'))
bpy.context.preferences.filepaths.save_version=0;S=bpy.context.scene
families=json.loads((ROOT/'assets/art200/palette.json').read_text())['families']
rows=json.loads((OLD/'manifest.json').read_text())
def lin(h):
    c=[int(h[i:i+2],16)/255 for i in [1,3,5]]
    return np.array([v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c])
choices=['denim','rose','oxblood','petrol','slate','plum','clay','verdigris','stone','celadon','heather','oxblood','denim','petrol','olive','slate','clay','verdigris','oxblood','heather','umber','celadon','stone','olive','plum']
material=bpy.data.objects[rows[0]['id']].data.materials[0];nodes=material.node_tree.nodes;links=material.node_tree.links
base=next(n for n in nodes if n.type=='TEX_IMAGE' and n.label=='BaseColor')
# Reloading the saved PNG gives the same color conversion used by native GLB
# import. Do not mistake newly generated Blender image buffers for sRGB bytes.
base.image=bpy.data.images.load(str(OUT/'NeutralPaint_BaseColor.png'),check_existing=False);base.image.pack()
shader=nodes.get('Principled BSDF');color=nodes.new('ShaderNodeVertexColor');color.layer_name='Art200Pigment'
mul=nodes.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=1
links.new(base.outputs['Color'],mul.inputs[1]);links.new(color.outputs['Color'],mul.inputs[2]);links.new(mul.outputs[0],shader.inputs['Base Color'])
neutral=lin('#C0C0C0');ivory=lin('#B4B0A2')
audit=[]
for row,family_id in zip(rows,choices):
    family=next(p for p in families if p['id']==family_id)
    primary=lin(family['paint']);secondary=lin(family['secondary'])
    partset=[bpy.data.objects[row['id']]]+list(bpy.data.collections[row['id']+' editable components'].objects)
    colored=0
    for o in partset:
        if o.type!='MESH':continue
        uv=o.data.uv_layers.active
        if uv is None:continue
        n=len(o.data.loops);uvs=np.empty(n*2,dtype=np.float32);uv.data.foreach_get('uv',uvs);uvs=uvs.reshape(-1,2)
        tile=(3-np.minimum(3,np.floor(uvs[:,1]*4).astype(int)))*4+np.minimum(3,np.floor(uvs[:,0]*4).astype(int))
        colors=np.ones((n,4),dtype=np.float32)
        for k,value in [(1,primary if row['id']=='wreck-ambulance' else ivory),(3,primary),(7,secondary),(8,primary*.88),(14,secondary*.86)]:
            colors[tile==k,:3]=np.clip(value/neutral,0,1)
        attr=o.data.color_attributes.get('Art200Pigment') or o.data.color_attributes.new(name='Art200Pigment',type='FLOAT_COLOR',domain='CORNER')
        attr.data.foreach_set('color',colors.ravel());o.data.color_attributes.active_color=attr
        colored+=int(np.count_nonzero(np.any(colors[:,:3]<.99,axis=1)))
    row['palette_family']=family_id;row['art200_touchup']='Model-specific muted pigment; neutral shared atlas with linear vertex tint, preserved wear, decal graphics and substrate separation.'
    audit.append({'id':row['id'],'palette_family':family_id,'colored_corners_including_components':colored,'geometry_changed':False,'source_components_preserved':True})
    print('TOUCHED',row['id'],family_id,flush=True)
saved={}
for row in rows:
    o=bpy.data.objects[row['id']];saved[o.name]=o.location.copy();o.location=(0,0,0)
bpy.ops.object.select_all(action='DESELECT')
for row in rows:bpy.data.objects[row['id']].select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'godot/art/art100-legacy.glb'),export_format='GLB',use_selection=True,export_yup=True,export_normals=True,export_texcoords=True,export_tangents=True,export_materials='EXPORT',export_vertex_color='NAME',export_vertex_color_name='Art200Pigment',export_all_vertex_colors=False)
for name,at in saved.items():bpy.data.objects[name].location=at
bpy.ops.wm.save_as_mainfile(filepath=str(OLD/'Art100_DesertRefinement.blend'))
(OLD/'manifest.json').write_text(json.dumps(rows,indent=2)+'\n')
(OUT/'touchup-audit.json').write_text(json.dumps({'models':25,'palette_families':sorted(set(choices)),'materials_per_model':1,'review':audit},indent=2)+'\n')
# Re-render all25 individually from the touched editable master.
models=[bpy.data.objects[r['id']] for r in rows];camera=S.camera
S.render.resolution_x=920;S.render.resolution_y=920;S.render.resolution_percentage=100;S.cycles.samples=24
for o in models:o.location=(0,0,0);o.hide_render=True
for o in models:
    o.hide_render=False;bpy.context.view_layer.update()
    pts=[o.matrix_world@Vector(p) for p in o.bound_box];lo=Vector([min(p[k] for p in pts) for k in range(3)]);hi=Vector([max(p[k] for p in pts) for k in range(3)]);center=(lo+hi)*.5;span=max(hi-lo)
    camera.location=center+Vector((1.15,-1.5,.95))*span;camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=span*1.42
    S.render.filepath=str(OLD/'renders'/(o.name+'.png'));bpy.ops.render.render(write_still=True);o.hide_render=True
    print('REVIEWED',o.name,flush=True)
print('ART200_LEGACY_PALETTE_COMPLETE',flush=True)

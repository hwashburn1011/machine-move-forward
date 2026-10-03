"""Apply final reviewed graphics to all25 editable and runtime assemblies."""
import bpy,json
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];OLD=ROOT/'assets/art100/legacy';OUT=ROOT/'assets/art200/legacy-touchup'
bpy.ops.wm.open_mainfile(filepath=str(OLD/'Art100_DesertRefinement.blend'));bpy.context.preferences.filepaths.save_version=0;S=bpy.context.scene
rows=json.loads((OLD/'manifest.json').read_text())
material=bpy.data.objects[rows[0]['id']].data.materials[0]
for label,filename in [('BaseColor','NeutralPaint_BaseColor.png'),('Normal','Finecomb_Normal.png'),('ORM','Finecomb_ORM.png')]:
    node=next(n for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.label==label)
    im=bpy.data.images.load(str(OUT/filename),check_existing=False);im.colorspace_settings.name='sRGB' if label=='BaseColor' else 'Non-Color';im.pack();node.image=im
for o in [bpy.data.objects['bus-shelter'],*bpy.data.collections['bus-shelter editable components'].objects]:
    if o.type!='MESH' or not o.data.uv_layers.active:continue
    uv=o.data.uv_layers.active;n=len(o.data.loops);values=np.empty(n*2,dtype=np.float32);uv.data.foreach_get('uv',values);values=values.reshape(-1,2)
    tiles=(3-np.minimum(3,np.floor(values[:,1]*4).astype(int)))*4+np.minimum(3,np.floor(values[:,0]*4).astype(int))
    values[tiles==15]+=np.array([-.25,.25]);uv.data.foreach_set('uv',values.ravel())
saved={}
for row in rows:
    o=bpy.data.objects[row['id']];saved[o.name]=o.location.copy();o.location=(0,0,0)
bpy.ops.object.select_all(action='DESELECT')
for row in rows:bpy.data.objects[row['id']].select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'godot/art/art100-legacy.glb'),export_format='GLB',use_selection=True,export_yup=True,export_normals=True,export_texcoords=True,export_tangents=True,export_materials='EXPORT',export_vertex_color='NAME',export_vertex_color_name='Art200Pigment',export_all_vertex_colors=False)
for name,at in saved.items():bpy.data.objects[name].location=at
bpy.ops.wm.save_as_mainfile(filepath=str(OLD/'Art100_DesertRefinement.blend'))
for row in rows:
    row['fine_comb_refinement']='Subtle nondirectional enamel variation replaces artificial painted triangular dents; native pigment, real mesh deformation and substrate separation retained.'
    if row['id']=='bus-shelter':row['fine_comb_refinement']+=' Dedicated AMBERLINE / DUSTMILE STOP / ROUTE07 graphic replaces unrelated highway sign.'
(OLD/'manifest.json').write_text(json.dumps(rows,indent=2)+'\n')
source=(ROOT/'tools/art/art200_legacy_palette.py').read_text()
exec(compile(source[source.index('# Re-render all25'):],str(ROOT/'tools/art/art200_legacy_palette.py'),'exec'))

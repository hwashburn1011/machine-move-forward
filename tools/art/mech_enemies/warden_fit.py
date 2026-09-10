"""Restore sleeve deformation after the shoulder suspension adjustment."""
import bpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/mech-enemies';rig=bpy.data.objects['warden_Rig']
for o in bpy.context.scene.objects:
    if o.type=='MESH' and o.name.startswith(('Upper sleeve','Bicep tapered shell')):
        side='r' if ' r' in o.name else 'l';name='upperarm_'+side
        o.vertex_groups.clear();o.vertex_groups.new(name=name).add(list(range(len(o.data.vertices))),1,'REPLACE');o['deformBone']=name
mat=bpy.data.materials['MECH_DeepRecess'];p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Roughness'].default_value=.77;p.inputs['Metallic'].default_value=.05;p.inputs['Specular IOR Level'].default_value=.16
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source/warden.blend'))
print('WARDEN SLEEVE FIT COMPLETE',flush=True)

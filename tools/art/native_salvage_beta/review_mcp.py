"""Preserve the live file and append an editable, staged recovery-family review."""
import bpy,json
from pathlib import Path
root=Path(r'C:/Users/hwash/Documents/MachineMoveForward')
out=root/'assets/native-salvage-beta'
before={'filepath':bpy.data.filepath,'dirty':bpy.data.is_dirty,'scene':bpy.context.scene.name}
# save a COPY, never change the user's filepath, and retain every existing scene.
bpy.ops.wm.save_as_mainfile(filepath=str(out/'MCP-session-preserved.blend'),copy=True,compress=True)
with bpy.data.libraries.load(str(out/'NomadSalvageBeta.blend'),link=False) as (source,target):target.scenes=source.scenes
scene=target.scenes[0];scene.name='Nomad salvage - editable beta review';bpy.context.window.scene=scene
positions={'PortClaw':(0,0,0),'DroneRoot':(1.8,0,.6),'SalvageDock':(1.8,0,0),
 'SalvageCassette':(.1,-2.1,0),'SalvageCoil':(1.25,-2.1,0),'SalvageCell':(2.2,-2.1,0)}
for obj in scene.objects:
    if obj.parent is None and obj.name.split('.')[0] in positions:obj.location=positions[obj.name.split('.')[0]]
with bpy.data.libraries.load(str(out/'NomadSalvageBetaReview.blend'),link=False) as (source,target):
    target.objects=[n for n in source.objects if n=='Camera' or n.startswith('Area') or n=='Studio floor']
for obj in target.objects:
    scene.collection.objects.link(obj)
    if obj.type=='CAMERA':scene.camera=obj
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='MATERIAL'
print(json.dumps({'before':before,'backup':str(out/'MCP-session-preserved.blend'),'review':scene.name,
 'editableMeshes':sum(o.type=='MESH' for o in scene.objects),'existingScenesPreserved':True}))

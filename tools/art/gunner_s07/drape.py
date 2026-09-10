"""Clear the inferred cloak from the shoulder and backpack in the back view."""
import bpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/gunner-s07'
for o in bpy.context.scene.objects:
 if o.type=='MESH' and o.name.startswith(('Wind-shaped shredded','Frayed cape fibre')):
  for v in o.data.vertices:
   p=o.matrix_world@v.co
   if p.x<.66:
    side=max(0,min(1,(p.x-.26)/.40));side=side*side*(3-2*side);drop=max(0,min(1,(1.70-p.z)/.09));required=(.19+.18*drop)*(1-side)+.15*side;p.y=max(p.y,required);v.co=o.matrix_world.inverted()@p
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source/S07_Gunner.blend'))

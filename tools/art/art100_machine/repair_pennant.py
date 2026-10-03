"""Seat the pennant stencil outside its solidified cloth shell; mirrored in build.py."""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/art100/machine';ART=ROOT/'godot/art'
bpy.context.preferences.filepaths.save_version=0
manifest=json.loads((OUT/'manifest.json').read_text());roots=[bpy.data.objects[k] for k in manifest]
palette=[m for m in bpy.data.materials if m.name.startswith('N100_')]
ink=next(o for o in bpy.data.objects['nomad-signal-pennant'].children if o.name=='Stamped FORWARD')
for v in ink.data.vertices:
    point=ink.matrix_world@v.co;t=(point.x-.025)/.68
    point.y=-(.02+math.sin(t*math.tau-.4)*.055*t+.010)
    v.co=ink.matrix_world.inverted()@point
source=(Path(__file__).parent/'build.py').read_text()
exec(compile(source[source.index('# Authoring master keeps'):],'<shared export footer>','exec'))

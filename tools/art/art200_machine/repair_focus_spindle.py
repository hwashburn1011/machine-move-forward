"""Incremental first-review support fixes; the same details are in build.py."""
import bpy, ast, math, json, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/art200/machine';ART=ROOT/'godot/art'
bpy.context.preferences.filepaths.save_version=0
source=(Path(__file__).parent/'build.py').read_text()
manifest=json.loads((OUT/'manifest.json').read_text())
roots=[bpy.data.objects[key] for key in manifest]
palette=[m for m in bpy.data.materials if m.name.startswith('N200_')]
alloy=bpy.data.materials['N200_machined_alloy']
steel=bpy.data.materials['N200_steel']
current=bpy.data.objects['nomad2-microscope-bench']
colors={f['id']:bpy.data.materials['N200_'+f['id']] for f in json.loads((ROOT/'assets/art200/palette.json').read_text())['families']}
tree=ast.parse(source)
for node in tree.body:
    if isinstance(node,ast.FunctionDef) and node.name in ['xyz','finish','tube','box','collider']:
        exec(compile(ast.Module(body=[node],type_ignores=[]),'<authored helper>','exec'))
if not any(o.name.startswith('Microscope focus spindle') for o in current.children):
    tube('Microscope focus spindle',(-.37,1.26,-.10),(-.09,1.26,-.10),.021,alloy,16)
screen=json.loads((OUT/'support-gap-screen.json').read_text())
for id,stamp,shift in [('nomad2-microscope-bench','Stamped MORROW / SPECIMENS',.015),('nomad2-typewriter-desk','Stamped COURIER / LETTERS',.015),('nomad2-bagatelle-table','Stamped RAILRUNNER / 193',.05)]:
    for cluster in screen[id]['unsupported_clusters']:
        if stamp in cluster:
            for name in cluster:bpy.data.objects[name].location.y+=shift
current=bpy.data.objects['nomad2-typewriter-desk']
box('Carriage mounting riser',(0,.951,-.10),(.54,.045,.16),colors['denim'],.009)
collider((0,1.05,-.10),(.66,.16,.16))
current=bpy.data.objects['nomad2-observation-seat']
box('Optical trunnion support',(0,1.27,.28),(.10,.12,.12),alloy,.012,True)
for cluster in screen['nomad2-boot-care-stand']['unsupported_clusters']:
    if 'Brush wooden back' in cluster:
        for name in cluster:bpy.data.objects[name].location.z-=.028
current=bpy.data.objects['nomad2-botanical-belljar']
bpy.data.objects.remove(bpy.data.objects['Bell jar column'],do_unlink=True)
box('Bell jar column',(0,.56,0),(.25,.88,.25),colors['verdigris'],.026)
for shape in manifest[current.name]['colliders']:
    if abs(shape['offset']['y']-.54)<.001:shape['offset']['y']=.56;shape['half']['y']=.44
exec(compile(source[source.index('# Authoring master keeps'):],'<shared export footer>','exec'))

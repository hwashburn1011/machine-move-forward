"""Four narrow support corrections found by the independent component review."""
import bpy,bmesh,ast,json,sys,math
from pathlib import Path
from mathutils import Vector,Matrix
R=Path(__file__).resolve().parents[3];mode=sys.argv[sys.argv.index('--')+1]
O=R/('assets/art100/story-robots' if mode=='old' else 'assets/art200/story');base='StoryRobots' if mode=='old' else 'Story200'
bpy.ops.wm.open_mainfile(filepath=str(O/(base+'-editable.blend')));bpy.context.preferences.filepaths.save_version=0
data=json.loads((O/'manifest.json').read_text());steel=bpy.data.materials['A200 weathered load steel'];metal=bpy.data.materials['A200 aged brushed alloy']
tree=ast.parse((R/'tools/art/art100_story_robots/build.py').read_text())
for f in tree.body:
 if isinstance(f,ast.FunctionDef) and f.name in {'xyz','finish','box','tube'}:exec(compile(ast.Module(body=[f],type_ignores=[]),'<original geometry primitives>','exec'))
source=(R/'tools/art/art200_story/refine_phase2.py').read_text();tree=ast.parse(source)
fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='fix_mechanical_supports')
exec(compile(ast.Module(body=[fn],type_ignores=[]),'<reviewed support corrections>','exec'));fix_mechanical_supports()
changes={'CourierChargeCradle':'Insulated feedthrough pins connect all three spring contacts to the pedestal.','FoundryPowerBus':'Raised circuit number plates support the 2/1/0 labels.','Story2ServoPress':'Pressure gauge is seated on a connected tank tap, correcting a local-depth placement error.','Story2DeadPatrolTorso':'Retained neck spindle mechanically joins the disabled head and torso.'}
for entry in data['models']:
 if entry['id'] in changes:entry.setdefault('independent_review_fixes',[]).append(changes[entry['id']])
exec(compile(source[source.index('# Recompute all editable measurements'):],'<measured export>','exec'))

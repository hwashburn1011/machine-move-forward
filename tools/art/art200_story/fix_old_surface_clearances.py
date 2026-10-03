"""Narrow reviewed cabinet corrections without rebuilding the other geometry."""
import bpy,bmesh,ast,json,sys
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[3];O=R/'assets/art100/story-robots';base='StoryRobots';mode='old'
bpy.ops.wm.open_mainfile(filepath=str(O/(base+'-editable.blend')));bpy.context.preferences.filepaths.save_version=0
data=json.loads((O/'manifest.json').read_text())
source=(R/'tools/art/art200_story/refine_phase2.py').read_text();tree=ast.parse(source)
fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='fix_surface_clearances')
exec(compile(ast.Module(body=[fn],type_ignores=[]),'<surface clearances>','exec'));fix_surface_clearances()
for entry in data['models']:
 if entry['id']=='BerthSeedEnclosure':entry['phase2_notes'].append('Carrier numbers clear the curved caps; cabinet title has a separate unobstructed field.')
 if entry['id']=='IsolatorCabinet':entry['phase2_notes'].append('Identification plate resized and spaced above the instrument display.')
 if entry['id']=='SeedVault':entry['phase2_notes'].append('Meter assembly seated on the outer door, clear of the gasket and title.')
exec(compile(source[source.index('# Recompute all editable measurements'):],'<measured export>','exec'))

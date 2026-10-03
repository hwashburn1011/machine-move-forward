"""Repair saved editable furnishings, then reuse the authoritative export footer."""
import bpy,json,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];ART=ROOT/'godot/art'
collection='art100' if '--collection=art100' in sys.argv else 'art200'
OUT=ROOT/'assets'/collection/'machine';bpy.context.preferences.filepaths.save_version=0
master='NomadFurnishings.blend' if collection=='art100' else 'NomadLivingArchive.blend'
bpy.ops.wm.open_mainfile(filepath=str(OUT/master))
manifest=json.loads((OUT/'manifest.json').read_text());roots=[bpy.data.objects[k]for k in manifest]
palette=[m for m in bpy.data.materials if m.name.startswith('N100_' if collection=='art100' else 'N200_')]
sys.path.insert(0,str(Path(__file__).parent));from fine_comb import apply
changed,records=apply(roots,manifest)
(OUT/'fine-comb-applied.json').write_text(json.dumps({'models_reviewed':25,'models_changed':changed,'records':records},indent=2)+'\n')
print('FINE_COMB_CHANGED',collection,changed,flush=True)
if changed:sys.argv.append('--render-only='+','.join(changed))
source=(ROOT/'tools/art'/('art100_machine' if collection=='art100' else 'art200_machine')/'build.py').read_text()
exec(compile(source[source.index('# Authoring master keeps'):],'<shared export footer>','exec'))

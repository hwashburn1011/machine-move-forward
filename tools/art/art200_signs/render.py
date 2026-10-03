"""Render actual exported billboard geometry without rebuilding the master."""
from pathlib import Path
path=Path(__file__).with_name('build.py');source=path.read_text()
exec(compile(source.split('records=[]')[0],str(path),'exec'))
bpy.ops.import_scene.gltf(filepath=str(ROOT/'godot/art/art200-signs.glb'))
records=json.loads((OUT/'manifest.json').read_text())['models']
models=[bpy.data.objects[r['id']] for r in records]
exec(compile(source[source.index('# Neutral daylight inspection'):],str(path),'exec'))

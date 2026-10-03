"""Resume export/render from the component master without rebuilding models."""
from pathlib import Path
path=Path(__file__).with_name('build.py');source=path.read_text()
exec(compile(source.split('records=[]')[0],str(path),'exec'))
bpy.ops.wm.open_mainfile(filepath=str(OUT/'Art200_Advertising-editable.blend'))
S=bpy.context.scene
records=json.loads((OUT/'manifest.json').read_text())['models']
roots=[bpy.data.objects[r['id']] for r in records]
for r in roots:r.location=(0,0,0)
exec(compile(source[source.index('models=[]'):],str(path),'exec'))

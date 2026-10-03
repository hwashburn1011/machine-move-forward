"""Remove the two hidden zero-length crest webs without touching other parts."""
from pathlib import Path
path=Path(__file__).with_name('build.py');source=path.read_text()
exec(compile(source.split('records=[]')[0],str(path),'exec'))
bpy.ops.wm.open_mainfile(filepath=str(OUT/'Art200_Advertising-editable.blend'));S=bpy.context.scene
removed=[]
for o in list(bpy.data.objects):
    if o.type=='MESH' and o.name.startswith('Crest web') and max(v.co.z for v in o.data.vertices)-min(v.co.z for v in o.data.vertices)<1e-5:
        removed.append(o.name);bpy.data.objects.remove(o,do_unlink=True)
assert len(removed) in [0,2],removed
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Art200_Advertising-editable.blend'))
records=json.loads((OUT/'manifest.json').read_text())['models'];roots=[bpy.data.objects[r['id']] for r in records]
for rec,r in zip(records,roots):rec['source_parts']=sum(o.type=='MESH' for o in r.children_recursive)
for r in roots:r.location=(0,0,0)
print('REMOVED_ZERO_LENGTH_WEBS',removed,flush=True)
exec(compile(source[source.index('models=[]'):],str(path),'exec'))

"""Editable-source partner; transform only the same isolated text vertices."""
import bpy,json,sys
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'tools/art/native_site_roofs'));from fix_site_lettering import CONFIG
names=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['glass-orchard']
for id in names:
    spec=CONFIG[id];path=ROOT/spec['source'];bpy.ops.wm.open_mainfile(filepath=str(path))
    obj=bpy.data.objects[spec['mesh']]
    if obj.get('frontFacingTextVersion',0)==2:print(id,'source already corrected');continue
    already_rotated=obj.get('frontFacingTextFixed',False)
    bpy.context.view_layer.update();m=obj.matrix_world;inverse=m.inverted();normals=[n.vector.copy() for n in obj.data.corner_normals];reports=[]
    for label in spec['labels']:
        pivot=label['pivot'];picked=[]
        for vertex in obj.data.vertices:
            p=m@vertex.co;v=(p.x,p.z,-p.y)
            if abs(v[2]-pivot[2])<.006 and pivot[1]-.025<v[1]<pivot[1]+label['height']*1.08 and abs(v[0]-pivot[0])<label['halfWidth']:picked.append(vertex.index)
        assert len(picked)>50,(id,label,len(picked));picked=set(picked)
        p=Vector((pivot[0],-pivot[2],pivot[1]));rotation=Matrix.Identity(4) if already_rotated else Matrix.Rotation(3.141592653589793,4,'Z')
        target=label.get('target',pivot);target=Vector((target[0],-target[2],target[1]))
        local=inverse@Matrix.Translation(target)@rotation@Matrix.Translation(-p)@m
        for index in picked:obj.data.vertices[index].co=local@obj.data.vertices[index].co
        for i,loop in enumerate(obj.data.loops):
            if loop.vertex_index in picked:normals[i]=(local.to_3x3()@normals[i]).normalized()
        reports.append({'label':label['name'],'vertices':len(picked)})
    obj.data.update();obj.data.normals_split_custom_set(normals);obj['frontFacingTextFixed']=True;obj['frontFacingTextVersion']=2
    bpy.ops.wm.save_as_mainfile(filepath=str(path),compress=True)
    print('SOURCE_SITE_LETTERING_FIXED',id,json.dumps(reports),flush=True)

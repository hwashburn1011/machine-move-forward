import bpy,json
from mathutils import Vector
scene=bpy.data.scenes['Nomad native stair clearance inspection'];scene.view_layers[0].update()
rows=[]
for obj in scene.objects:
    if obj.type not in ['MESH','CURVE','FONT']:continue
    p=[obj.matrix_world@Vector(v) for v in obj.bound_box]
    p=[Vector((-v.x*.75,v.z*5/6-.0033333333333338544,v.y*.8)) for v in p]
    lo=[min(v[i] for v in p) for i in range(3)];hi=[max(v[i] for v in p) for i in range(3)]
    for label,box in [('lower', [(-12.1,-11.35),(11.25,11.85),(-1.6,-.65)]),('upper',[(-12.1,-11.35),(14.7,16.0),(-.65,-.15)])]:
        if all(hi[i]>=a and lo[i]<=b for i,(a,b) in enumerate(box)):
            rows.append({'area':label,'name':obj.name,'min':lo,'max':hi,'parent':obj.parent.name if obj.parent else None})
print(json.dumps(rows))

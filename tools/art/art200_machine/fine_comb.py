"""Second, independent-review-driven finishing pass, shared by both builders.

The static candidate list records reviewed 4mm gaps in authoring coordinates.
Only tiny stamped/stitched graphics move. All structural masses retain their
dimensions and colliders; compact real hardware closes their measured gaps.
"""
import bpy,bmesh,json,math
from pathlib import Path
from mathutils import Vector

REVISION='machine-fine-comb-2026-10-02-v2'
CANDIDATES=json.loads((Path(__file__).parent/'fine_comb_candidates.json').read_text())

def bounds(o):
    pts=[o.matrix_world@v.co for v in o.data.vertices]
    return Vector(tuple(min(p[k]for p in pts)for k in range(3))),Vector(tuple(max(p[k]for p in pts)for k in range(3)))

def nearest(group,others):
    best=None
    for a in group:
        al,ah=bounds(a)
        for b in others:
            bl,bh=bounds(b);pa=Vector();pb=Vector()
            for k in range(3):
                if ah[k]<bl[k]:pa[k]=ah[k];pb[k]=bl[k]
                elif bh[k]<al[k]:pa[k]=al[k];pb[k]=bh[k]
                else:pa[k]=pb[k]=(max(al[k],bl[k])+min(ah[k],bh[k]))/2
            distance=(pa-pb).length
            if best is None or distance<best[0]:best=(distance,a,b,pa,pb,al,ah,bl,bh)
    return best

def spacer(root,relation,material,label):
    distance,a,b,pa,pb,al,ah,bl,bh=relation
    assert distance<(.05 if label=='retained display backing' else .02),(root.name,a.name,b.name,distance)
    delta=pb-pa;axis=max(range(3),key=lambda k:abs(delta[k]));center=(pa+pb)*.5;size=Vector()
    for k in range(3):
        if k==axis:size[k]=abs(delta[k])+.008
        else:
            overlap=max(0,min(ah[k],bh[k])-max(al[k],bl[k]))
            size[k]=max(.012,min(.14,overlap*.48,(ah[k]-al[k])*.75))
    bpy.ops.mesh.primitive_cube_add(size=1,location=center);o=bpy.context.object;o.name='Finecomb '+label;o.parent=root
    o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(material)
    for p in o.data.polygons:p.use_smooth=True
    mod=o.modifiers.new('Small manufactured mount radius','BEVEL');mod.width=min(.002,min(size)*.15);mod.segments=1
    bpy.ops.object.modifier_apply(modifier=mod.name)
    mod=o.modifiers.new('Support weighted normals','WEIGHTED_NORMAL');mod.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=mod.name)
    o['supports_between']=a.name+' / '+b.name
    bpy.context.view_layer.update()
    return o

def apply(roots,manifest):
    changed=[];records=[]
    for root in roots:
        if root.get('fine_comb_revision')==REVISION:continue
        bpy.context.view_layer.update();objects={o.name:o for o in root.children_recursive if o.type=='MESH'}
        materials=[ma for o in objects.values()for ma in o.data.materials]
        steel=next((m for m in materials if 'steel' in m.name.lower()),materials[0])
        notes=[];removed=0
        for candidate in CANDIDATES.get(root.name,[]):
            group=[objects[n]for n in candidate['parts']];others=[o for n,o in objects.items()if n not in candidate['parts']]
            # Several circular display skins share one bounds component; each
            # receives its own physical backing, not a distant connecting bar.
            circular=[o for o in group if o.name.startswith('Speaker dark diaphragm')or o.name.startswith('Clock dial')]
            if circular:
                for target in circular:
                    relation=nearest([target],others)
                    if relation[0]>.0003:
                        added=spacer(root,relation,steel,'retained display backing');objects[added.name]=added
                notes.append('Individual display backing mounts');continue
            # The cap and column were mutually disconnected at the same10mm
            # distance; choose the actual base for the load-bearing column.
            if root.name=='nomad-air-filter-tower' and any(o.name=='Filter column main body' for o in group):
                relation=nearest([objects['Filter column main body']],[objects['Filter skid']])
            else:relation=nearest(group,others)
            distance=relation[0]
            if distance<=.0005:continue
            graphic=any(o.name.startswith(('Riveted nomenclature plate','Clip label','Pinned field postcard'))for o in group) or all(o.name.startswith(('Stamped ','Double stitched','Jacket chest patch','Jacket opening seam'))for o in group)
            if graphic:
                shift=(relation[4]-relation[3])*(max(0,distance-.0003)/distance)
                for o in group:o.location+=shift
                notes.append('Seated graphic '+group[0].name)
                bpy.context.view_layer.update()
            else:
                added=spacer(root,relation,steel,'captured mount / '+relation[1].name);objects[added.name]=added
                notes.append('Attached '+relation[1].name+' to '+relation[2].name)
        # Zero-length cylinder bevel sidewalls do not carry useful surface.
        # Remove their faces and newly loose edges/vertices, retaining UV layers.
        for o in root.children_recursive:
            if o.type!='MESH':continue
            bm=bmesh.new();bm.from_mesh(o.data)
            bad=[f for f in bm.faces if f.calc_area()<1e-10]
            if bad:
                removed+=len(bad);bmesh.ops.delete(bm,geom=bad,context='FACES_ONLY')
                loose=[v for v in bm.verts if not v.link_faces]
                if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
                bm.to_mesh(o.data);o.data.update()
            bm.free()
        if notes or removed:
            changed.append(root.name)
            manifest[root.name]['fine_comb_review']={'attachment_corrections':notes,'zero_area_faces_removed':removed}
        root['fine_comb_revision']=REVISION
        records.append({'id':root.name,'attachment_corrections':notes,'zero_area_faces_removed':removed})
    return changed,records

"""Remove only zero-area legacy runtime triangles after all authored passes.

Editable component meshes, material/image datablocks and useful geometry remain
unchanged. Runtime corner UV, pigment and custom normals are explicitly retained.
"""
import bpy
import hashlib
import json
import struct
import numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OLD = ROOT / 'assets/art100/legacy'
OUT = ROOT / 'assets/art200/legacy-touchup'
master = OLD / 'Art100_DesertRefinement.blend'
glb = ROOT / 'godot/art/art100-legacy.glb'
bpy.ops.wm.open_mainfile(filepath=str(master))
rows = json.loads((OLD/'manifest.json').read_text())
audit = []
audit_path = OUT/'degenerate-cleanup-audit.json'
prior = json.loads(audit_path.read_text()) if audit_path.exists() else {}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def values(collection, key, width, dtype=np.float32):
    out = np.empty(len(collection)*width, dtype=dtype)
    collection.foreach_get(key, out)
    return out.reshape((-1,width))

def source_digest():
    h = hashlib.sha256()
    for row in rows:
        coll = bpy.data.collections[row['id']+' editable components']
        for obj in sorted(coll.objects,key=lambda x:x.name):
            if obj.type != 'MESH': continue
            h.update(obj.name.encode())
            h.update(values(obj.data.vertices,'co',3).tobytes())
            h.update(values(obj.data.loops,'vertex_index',1,np.int32).tobytes())
    return h.hexdigest()

source_before = source_digest()
images_before = [(im.name, tuple(im.size), im.filepath) for im in bpy.data.images]
for row in rows:
    obj = bpy.data.objects[row['id']]
    old = obj.data
    doomed = [p.index for p in old.polygons if p.area < 1e-12]
    if not doomed:
        prior_row=next((r for r in prior.get('changes',[]) if r['id']==row['id']),None)
        if prior_row:
            old.calc_loop_triangles()
            prior_row['remaining_triangles']=len(old.loop_triangles)
            audit.append(prior_row)
        continue
    assert all(len(p.vertices)==3 for p in old.polygons), row['id']
    bad = set(doomed)
    keep = [p for p in old.polygons if p.index not in bad]
    faces = [list(p.vertices) for p in keep]
    loop_ids = np.array([j for p in keep for j in p.loop_indices],dtype=np.int32)
    face_ids = np.array([p.index for p in keep],dtype=np.int32)
    coords = values(old.vertices,'co',3)
    normals = values(old.corner_normals,'vector',3)[loop_ids].copy()
    uv = values(old.uv_layers.active.data,'uv',2)[loop_ids].copy()
    pigment = values(old.color_attributes['Art200Pigment'].data,'color',4)[loop_ids].copy()
    old_color_active = old.color_attributes.active_color_name
    active_uv = old.uv_layers.active.name
    render_uv = next((layer.name for layer in old.uv_layers if layer.active_render),active_uv)
    new = bpy.data.meshes.new(old.name+' clean runtime')
    new.from_pydata(coords.tolist(),[],faces)
    new.update()
    for material in old.materials: new.materials.append(material)
    for p,q in zip(keep,new.polygons):
        q.material_index=p.material_index
        q.use_smooth=p.use_smooth
    edge_lookup = {tuple(sorted(e.vertices)):e.index for e in old.edges}
    edge_ids = np.array([edge_lookup[tuple(sorted(e.vertices))] for e in new.edges],dtype=np.int32)
    indices = {'POINT':np.arange(len(old.vertices)), 'CORNER':loop_ids, 'FACE':face_ids, 'EDGE':edge_ids}
    fields = {'FLOAT':('value',1,np.float32), 'INT':('value',1,np.int32),
        'FLOAT_VECTOR':('vector',3,np.float32), 'FLOAT2':('vector',2,np.float32),
        'FLOAT_COLOR':('color',4,np.float32), 'BYTE_COLOR':('color',4,np.float32),
        'BOOLEAN':('value',1,np.bool_)}
    saved_attributes = {}
    for attr in old.attributes:
        if attr.is_internal or attr.name in ['position','material_index','sharp_face','custom_normal']:
            continue
        assert attr.data_type in fields,(row['id'],attr.name,attr.data_type)
        field,width,dtype=fields[attr.data_type]
        expected=values(attr.data,field,width,dtype)[indices[attr.domain]].copy()
        target=new.attributes.get(attr.name) or new.attributes.new(attr.name,attr.data_type,attr.domain)
        target.data.foreach_set(field,expected.reshape(-1))
        saved_attributes[attr.name]=(field,width,dtype,expected)
    new.uv_layers.active=new.uv_layers[active_uv]
    new.uv_layers[render_uv].active_render=True
    new.color_attributes.active_color_name=old_color_active
    new.normals_split_custom_set(normals.tolist())
    new.update()
    assert np.array_equal(values(new.vertices,'co',3),coords)
    assert np.array_equal(values(new.uv_layers.active.data,'uv',2),uv)
    assert np.array_equal(values(new.color_attributes['Art200Pigment'].data,'color',4),pigment)
    for name,(field,width,dtype,expected) in saved_attributes.items():
        assert np.array_equal(values(new.attributes[name].data,field,width,dtype),expected),(row['id'],name)
    result_normals=values(new.corner_normals,'vector',3)
    max_normal_delta=float(np.max(np.abs(result_normals-normals)))
    # Blender stores custom normals as 16-bit angular offsets in the current
    # corner fan basis. Removing collapsed pole faces changes that basis;
    # retain the original vectors subject only to its re-encoding precision.
    assert max_normal_delta<.0025,(row['id'],max_normal_delta)
    assert all(p.area>=1e-12 for p in new.polygons),row['id']
    obj.data=new
    new.calc_loop_triangles()
    row['triangles']=len(new.loop_triangles)
    row['runtime_geometry_sha256']=digest(coords.astype('<f4').tobytes()+np.array([t.vertices[:]for t in new.loop_triangles],dtype='<u4').tobytes())
    row['degenerate_runtime_cleanup']='Removed zero-area triangles only; retained all vertex positions, useful-face UV/pigment and custom corner normals. Editable components unchanged.'
    audit.append(dict(id=row['id'],removed_faces=len(doomed),remaining_triangles=row['triangles'],
        useful_uv_pigment_and_named_attributes_bit_exact=True,
        vertex_positions_bit_exact=True,maximum_custom_normal_delta=max_normal_delta,
        zero_area_faces_after=0))
    print('CLEANED',row['id'],len(doomed),max_normal_delta,flush=True)

assert source_digest()==source_before,'Editable component geometry modified'
assert [(im.name,tuple(im.size),im.filepath)for im in bpy.data.images]==images_before
saved={r['id']:bpy.data.objects[r['id']].location.copy()for r in rows}
bpy.ops.object.select_all(action='DESELECT')
for row in rows:
    obj=bpy.data.objects[row['id']];obj.location=(0,0,0);obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,
    export_yup=True,export_normals=True,export_texcoords=True,export_tangents=True,
    export_materials='EXPORT',export_vertex_color='NAME',export_vertex_color_name='Art200Pigment',export_all_vertex_colors=False)
# A collapsed cap UV can leave one undefined MikkTSpace tangent once the
# zero-area pole triangles disappear. Keep every position/normal/UV/color
# byte unchanged and provide a unit vector orthogonal to the existing normal
# only for this mathematically undefined tangent. No remap or UV alteration.
payload=bytearray(glb.read_bytes());at=12;document=None;binary_offset=None
while at<len(payload):
    size,kind=struct.unpack_from('<II',payload,at);at+=8
    if kind==0x4e4f534a: document=json.loads(payload[at:at+size])
    elif kind==0x004e4942: binary_offset=at
    at+=size
def floats(accessor_id,width):
    accessor=document['accessors'][accessor_id];view=document['bufferViews'][accessor['bufferView']]
    assert accessor['componentType']==5126
    return np.ndarray((accessor['count'],width),dtype='<f4',buffer=payload,
        offset=binary_offset+view.get('byteOffset',0)+accessor.get('byteOffset',0),
        strides=(view.get('byteStride',width*4),4))
tangent_fallbacks=[]
for node in document['nodes']:
    if 'mesh' not in node:continue
    for primitive in document['meshes'][node['mesh']]['primitives']:
        attrs=primitive['attributes'];tangent=floats(attrs['TANGENT'],4);normal=floats(attrs['NORMAL'],3)
        for index in np.flatnonzero(np.linalg.norm(tangent[:,:3],axis=1)<1e-6):
            n=normal[index].astype(np.float64);axis=np.eye(3)[int(np.argmin(np.abs(n)))]
            fallback=np.cross(n,axis);fallback/=np.linalg.norm(fallback)
            tangent[index,:3]=fallback
            if abs(tangent[index,3])<.5:tangent[index,3]=1
            tangent_fallbacks.append(dict(id=node['name'],export_vertex=int(index),reason='Undefined tangent at collapsed cap UV; unit normal-orthogonal fallback only.'))
glb.write_bytes(payload)
for name,location in saved.items():bpy.data.objects[name].location=location
bpy.ops.wm.save_as_mainfile(filepath=str(master))
(OLD/'manifest.json').write_text(json.dumps(rows,indent=2)+'\n')
report=dict(changes=audit,removed_faces=sum(x['removed_faces']for x in audit),
    total_triangles=sum(r['triangles']for r in rows),editable_source_geometry_sha256=source_before,
    editable_components_and_images_unchanged=True,glb_sha256=digest(glb.read_bytes()),
    master_sha256=digest(master.read_bytes()),
    undefined_export_tangent_fallbacks=tangent_fallbacks,
    render_policy='No new raster renders: removed faces had precisely zero raster area; all useful position/UV/pigment data remain bit exact and custom normal differences are bounded by the recorded quantization tolerance.')
audit_path.write_text(json.dumps(report,indent=2)+'\n')
print('LEGACY_DEGENERATE_CLEANUP_COMPLETE',report['removed_faces'],report['total_triangles'],report['glb_sha256'],flush=True)

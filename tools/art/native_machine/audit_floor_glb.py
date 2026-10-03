"""Measure actual coplanar upward triangles, rather than only author rectangles."""
from pathlib import Path
import json, struct, hashlib
import numpy as np
from shapely.geometry import Polygon
from shapely.ops import unary_union

ROOT=Path(__file__).resolve().parents[3]
PATH=ROOT/'godot/art/nomad-access.glb'
payload=PATH.read_bytes();at=12;doc=None;binary=None
while at<len(payload):
    size,kind=struct.unpack_from('<II',payload,at);at+=8;chunk=payload[at:at+size];at+=size
    if kind==0x4e4f534a:doc=json.loads(chunk)
    elif kind==0x004e4942:binary=chunk
def accessor(index):
    spec=doc['accessors'][index];view=doc['bufferViews'][spec['bufferView']]
    dtype={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[spec['componentType']]
    width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[spec['type']]
    return np.ndarray((spec['count'],width),dtype=dtype,buffer=binary,offset=view.get('byteOffset',0)+spec.get('byteOffset',0),strides=(view.get('byteStride',np.dtype(dtype).itemsize*width),np.dtype(dtype).itemsize)).astype(np.float64)
groups={str(i):[] for i in [-2,-1,0]};total=0;degenerate=0
for node in doc['nodes']:
    if 'mesh' not in node:continue
    assert node.get('translation',[0,0,0])==[0,0,0] and node.get('scale',[1,1,1])==[1,1,1] and node.get('rotation',[0,0,0,1])==[0,0,0,1]
    for prim in doc['meshes'][node['mesh']]['primitives']:
        verts=accessor(prim['attributes']['POSITION']);indices=accessor(prim['indices']).astype(int).reshape(-1,3)
        tris=verts[indices];norm=np.cross(tris[:,1]-tris[:,0],tris[:,2]-tris[:,0]);area=np.linalg.norm(norm,axis=1)*.5
        total+=len(tris);degenerate+=int((area<1e-12).sum())
        for level in groups:
            y=16.03+int(level)*3.6
            selected=tris[(np.max(np.abs(tris[:,:,1]-y),axis=1)<.00002)&(norm[:,1]>.000001)]
            groups[level].extend(Polygon(t[:,[0,2]]) for t in selected)
report={'path':str(PATH.relative_to(ROOT)),'sha256':hashlib.sha256(payload).hexdigest(),'triangles':total,'degenerate_triangles':degenerate,'decks':{}}
for level,polys in groups.items():
    union=unary_union(polys);summed=sum(p.area for p in polys);overlap=summed-union.area
    report['decks'][level]={'horizontal_top_triangles':len(polys),'top_area_m2':union.area,'sum_triangle_area_m2':summed,'coincident_upward_area_m2':overlap}
    assert overlap<.00001,(level,overlap)
assert degenerate==0
(ROOT/'test-results/roof-floor/machine-floor-export-audit.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))

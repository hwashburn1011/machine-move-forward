"""Read-only actual GLB triangle-area verification for root review packs."""
from pathlib import Path
import hashlib
import json
import struct
import numpy as np

ROOT=Path(__file__).resolve().parents[3]
result={}
for pack in ['art100-legacy','art200-signs']:
    path=ROOT/'godot/art'/f'{pack}.glb'
    payload=path.read_bytes();at=12;document=None;binary=None
    while at<len(payload):
        size,kind=struct.unpack_from('<II',payload,at);at+=8
        chunk=payload[at:at+size];at+=size
        if kind==0x4e4f534a:document=json.loads(chunk)
        elif kind==0x004e4942:binary=chunk
    def accessor(index):
        spec=document['accessors'][index];view=document['bufferViews'][spec['bufferView']]
        dtype={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[spec['componentType']]
        width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[spec['type']]
        return np.ndarray((spec['count'],width),dtype=dtype,buffer=binary,
            offset=view.get('byteOffset',0)+spec.get('byteOffset',0),
            strides=(view.get('byteStride',np.dtype(dtype).itemsize*width),np.dtype(dtype).itemsize))
    models=[]
    for node in document['nodes']:
        if 'mesh' not in node:continue
        count=degenerate=nonfinite=0
        for primitive in document['meshes'][node['mesh']]['primitives']:
            vertices=accessor(primitive['attributes']['POSITION']).astype(np.float64)
            indices=accessor(primitive['indices']).reshape((-1,3))
            triangles=vertices[indices]
            area=np.linalg.norm(np.cross(triangles[:,1]-triangles[:,0],triangles[:,2]-triangles[:,0]),axis=1)*.5
            count+=len(indices);degenerate+=int((area<1e-12).sum());nonfinite+=int((~np.isfinite(vertices)).sum())
        assert degenerate==0 and nonfinite==0,(node['name'],degenerate,nonfinite)
        models.append(dict(id=node['name'],triangles=count,degenerate_triangles=degenerate,nonfinite_coordinates=nonfinite))
    assert len(models)==25,pack
    result[pack]=dict(glb_sha256=hashlib.sha256(payload).hexdigest(),models=models,
        triangles=sum(x['triangles']for x in models),degenerate_triangles=0)
(ROOT/'assets/art200/fine-comb/legacy-signs-glb-geometry.json').write_text(json.dumps(result,indent=2)+'\n')
print('ROOT_GLB_GEOMETRY_CLEAN',sum(len(p['models'])for p in result.values()))

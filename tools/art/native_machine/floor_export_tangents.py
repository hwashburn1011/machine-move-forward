"""Preserve shared-material tangents and normalize only invalid UV corners."""
import json, math, struct
from pathlib import Path

def repair(path):
    data=Path(path).read_bytes();length=struct.unpack_from('<I',data,12)[0]
    doc=json.loads(data[20:20+length]);pos=20+length
    binary=bytearray(data[pos+8:]);fixed=0
    def offset(index,i):
        a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];size=16 if a['type']=='VEC4' else 12
        return v.get('byteOffset',0)+a.get('byteOffset',0)+i*v.get('byteStride',size)
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            attributes=primitive['attributes']
            if 'TANGENT' not in attributes:continue
            ti=attributes['TANGENT'];ni=attributes['NORMAL']
            for i in range(doc['accessors'][ti]['count']):
                at=offset(ti,i);t=struct.unpack_from('<4f',binary,at)
                length=math.sqrt(sum(v*v for v in t[:3]))
                if length>.999 and length<1.001:continue
                if length>.00001:xyz=[v/length for v in t[:3]]
                else:
                    n=struct.unpack_from('<3f',binary,offset(ni,i));axis=min(range(3),key=lambda j:abs(n[j]));a=[0,0,0];a[axis]=1
                    xyz=[n[1]*a[2]-n[2]*a[1],n[2]*a[0]-n[0]*a[2],n[0]*a[1]-n[1]*a[0]]
                    length=math.sqrt(sum(v*v for v in xyz));xyz=[v/length for v in xyz]
                struct.pack_into('<4f',binary,at,*xyz,1 if t[3]>=0 else -1);fixed+=1
    # Binary-only patch: JSON, vertex positions, indices, normals, UV and all
    # valid tangent vectors remain exactly as exported.
    Path(path).write_bytes(data[:pos+8]+binary)
    return fixed

if __name__=='__main__':
    root=Path(__file__).resolve().parents[3]
    print('Repaired tangent corners:',repair(root/'godot/art/nomad-access.glb'))

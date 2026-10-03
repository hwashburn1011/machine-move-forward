"""Resolve Blender's rare zero tangents from adjacent UV triangles."""
import json, struct
import numpy as np

def repair(path):
    data=bytearray(path.read_bytes());length=struct.unpack_from('<I',data,12)[0]
    gltf=json.loads(data[20:20+length]);binary=28+length;changed=0
    def array(index):
        acc=gltf['accessors'][index];view=gltf['bufferViews'][acc['bufferView']]
        width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[acc['type']]
        dtype=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2'}[acc['componentType']])
        return np.ndarray((acc['count'],width),dtype,buffer=data,offset=binary+view.get('byteOffset',0)+acc.get('byteOffset',0),strides=(view.get('byteStride',width*dtype.itemsize),dtype.itemsize))
    for mesh in gltf['meshes']:
        for primitive in mesh['primitives']:
            attrs=primitive['attributes']
            if 'TANGENT' not in attrs:continue
            tangent=array(attrs['TANGENT']);bad=np.where(np.linalg.norm(tangent[:,:3],axis=1)<1e-6)[0]
            if not len(bad):continue
            positions=array(attrs['POSITION']);normals=array(attrs['NORMAL']);uv=array(attrs['TEXCOORD_0']);indices=array(primitive['indices']).reshape(-1,3)
            for vertex in bad:
                normal=normals[vertex].astype(float);candidates=[]
                for tri in indices[np.any(indices==vertex,axis=1)]:
                    p=positions[tri].astype(float);t=uv[tri].astype(float)
                    a,b=p[1]-p[0],p[2]-p[0];u,v=t[1]-t[0],t[2]-t[0];det=u[0]*v[1]-u[1]*v[0]
                    if abs(det)<1e-14:continue
                    direction=(a*v[1]-b*u[1])/det;direction-=normal*np.dot(normal,direction)
                    if np.linalg.norm(direction)<1e-10:continue
                    direction/=np.linalg.norm(direction);bitangent=(b*u[0]-a*v[0])/det
                    sign=-1 if np.dot(np.cross(normal,direction),bitangent)<0 else 1
                    candidates.append((np.linalg.norm(np.cross(a,b)),direction,sign))
                if not candidates:raise ValueError(f'No valid UV triangle for tangent {vertex}')
                _,direction,sign=max(candidates,key=lambda c:c[0]);tangent[vertex]=[*direction,sign];changed+=1
    if changed:path.write_bytes(data)
    return changed

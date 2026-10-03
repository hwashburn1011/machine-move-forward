"""Correct only mirrored +Z-facing labels inside merged lettering meshes.

No re-export: selected text vertices/normals/tangents are rotated 180 degrees
about their authored label pivot. All other vertices, UVs, materials, images,
triangle indices, nodes and functional anchors stay byte-identical.
"""
import copy,hashlib,json,struct,sys
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[3]
CONFIG={
'glass-orchard':{'mesh':'GlassOrchard_Array_Lettering','source':'assets/glass-orchard/glass-orchard.blend','labels':[{'name':'Memory vault title','pivot':[5,3.87,-5.04],'height':.21,'halfWidth':3.1},{'name':'Orchard identity','pivot':[-5,3.24,-1.6],'target':[-5,3.38,-1.449],'height':.4,'halfWidth':3.0},{'name':'Orchard promise','pivot':[-5,2.98,-1.6],'target':[-5,3.16,-1.449],'height':.15,'halfWidth':2.6}]},
'last-garden-meridian':{'mesh':'LastGardenMeridian_Array_Lettering','source':'assets/meridian/last-garden-meridian.blend','labels':[{'name':'Refuge garden sign','pivot':[-5,2.8,-3.43],'height':.32,'halfWidth':3.0},{'name':'Refuge promise','pivot':[-5,2.5,-3.43],'height':.10,'halfWidth':3.0}]}}

def matrix(node):
    if 'matrix' in node:return np.array(node['matrix']).reshape((4,4),order='F')
    x,y,z,w=node.get('rotation',[0,0,0,1]);m=np.eye(4)
    m[:3,:3]=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]
    m[:3,:3]=m[:3,:3]@np.diag(node.get('scale',[1,1,1]));m[:3,3]=node.get('translation',[0,0,0]);return m

def run(id):
    config=CONFIG[id];path=ROOT/f'godot/assets/models/authored/{id}.glb';old=path.read_bytes()
    receipt=ROOT/f'assets/native-site-roofs/{id}-lettering-fix.json'
    backup=ROOT/f'test-results/roof-floor/source-before/{id}-before-lettering.glb'
    if receipt.exists():
        prior=json.loads(receipt.read_text());current=hashlib.sha256(old).hexdigest()
        assert current in [prior['beforeSha256'],prior['afterSha256']], 'Unrecognized later edit; preserve current asset'
        if current==prior['afterSha256'] and prior.get('config')==config:
            print(id,'already corrected; preserved unchanged');return
        if current==prior['afterSha256']:old=backup.read_bytes()
    length=struct.unpack_from('<I',old,12)[0]
    doc=json.loads(old[20:20+length]);before=copy.deepcopy(doc);data=bytearray(old[28+length:]);original=bytes(data)
    nodes=doc['nodes'];index=next(i for i,n in enumerate(nodes) if n.get('name')==config['mesh']);node=nodes[index]
    def world(i):
        parent=next((j for j,n in enumerate(nodes) if i in n.get('children',[])),None)
        return (world(parent) if parent is not None else np.eye(4))@matrix(nodes[i])
    transform=world(index);inverse=np.linalg.inv(transform);rotation=np.diag([-1,1,-1]);allowed=set();reports=[]
    def array(index):
        a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];dtype={5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']];dim={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',np.dtype(dtype).itemsize*dim)
        return np.ndarray((a['count'],dim),dtype,buffer=data,offset=start,strides=(stride,np.dtype(dtype).itemsize)),start,stride
    for primitive in doc['meshes'][node['mesh']]['primitives']:
        attrs=primitive['attributes'];positions,_,_=array(attrs['POSITION']);points=np.c_[positions,np.ones(len(positions))]@transform.T;points=points[:,:3]
        indices,_,_=array(primitive['indices']);triangles=indices.reshape((-1,3))
        for label in config['labels']:
            pivot=np.array(label['pivot']);mask=(np.abs(points[:,2]-pivot[2])<.006)&(points[:,1]>pivot[1]-.025)&(points[:,1]<pivot[1]+label['height']*1.08)&(np.abs(points[:,0]-pivot[0])<label['halfWidth'])
            picked=np.where(mask)[0];assert len(picked)>100,(id,label,len(picked))
            counts=mask[triangles].sum(axis=1);assert not np.any((counts!=0)&(counts!=3)),('partial text triangle',id,label)
            original_points=points[picked].copy();changed=(original_points-pivot)@rotation.T+np.array(label.get('target',label['pivot']))
            positions[picked]=(np.c_[changed,np.ones(len(changed))]@inverse.T)[:,:3]
            for semantic in ['NORMAL','TANGENT']:
                if semantic not in attrs:continue
                normals,_,_=array(attrs[semantic]);normal_rotation=inverse[:3,:3]@rotation@transform[:3,:3]
                normals[picked,:3]=normals[picked,:3]@normal_rotation.T
            for semantic in ['POSITION','NORMAL','TANGENT']:
                if semantic not in attrs:continue
                a,start,stride=array(attrs[semantic])
                for vertex in picked:allowed.update(range(start+int(vertex)*stride,start+int(vertex)*stride+12))
            reports.append({'name':label['name'],'pivot':label['pivot'],'targetPivot':label.get('target',label['pivot']),'vertices':len(picked),'triangles':int(np.sum(counts==3)),'mixedTriangles':0})
        accessor=doc['accessors'][attrs['POSITION']];accessor['min']=positions.min(axis=0).tolist();accessor['max']=positions.max(axis=0).tolist()
    changed_bytes={i for i,(a,b) in enumerate(zip(original,data)) if a!=b};assert changed_bytes<=allowed
    unchanged=copy.deepcopy(doc)
    for a,b in zip(unchanged['accessors'],before['accessors']):
        for field in ['min','max']:
            if field in b:a[field]=b[field]
    assert unchanged==before,'Unexpected scene/material metadata change'
    encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
    body=bytes(data);out=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(body))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(body),0x004e4942)+body
    if not backup.exists():backup.write_bytes(old)
    path.write_bytes(out)
    report={'asset':id,'config':config,'beforeSha256':hashlib.sha256(old).hexdigest(),'afterSha256':hashlib.sha256(out).hexdigest(),'labels':reports,'onlySelectedPositionNormalTangentBytesChanged':True,'changedBytes':len(changed_bytes),'uvsIndicesImagesMaterialsOtherNodesPreserved':True}
    (ROOT/f'assets/native-site-roofs/{id}-lettering-fix.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))

if __name__=='__main__':
    for name in sys.argv[1:] or ['glass-orchard']:run(name)

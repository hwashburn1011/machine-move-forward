"""Read-only triangle/UV/material audit against the preserved shipped Foundry."""
import collections,hashlib,json,struct
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[3]
BASE=ROOT/'test-results/roof-floor/source-before/relay-foundry-runtime.glb'
NEW=ROOT/'godot/assets/models/authored/relay-foundry.glb'

def read(path):
    raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+n]);return doc,raw[28+n:]

def array(doc,data,index):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
    dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
    dim={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
    offset=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',np.dtype(dtype).itemsize*dim)
    return np.ndarray((a['count'],dim),dtype,buffer=data,offset=offset,strides=(stride,np.dtype(dtype).itemsize)).copy()

def transform(n):
    if 'matrix' in n:return np.array(n['matrix']).reshape((4,4),order='F')
    m=np.eye(4);x,y,z,w=n.get('rotation',[0,0,0,1])
    m[:3,:3]=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]
    m[:3,:3]=m[:3,:3]@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0]);return m

def geometry(path):
    doc,data=read(path);triangles=collections.Counter();uvs=collections.Counter();markers={};bounds={};floor_triangles=0
    def walk(index,parent,roof=False):
        nonlocal floor_triangles
        n=doc['nodes'][index];m=parent@transform(n);name=n.get('name','');roof=roof or name=='FoundryRoof'
        if 'mesh' not in n:markers[name]=m[:3,3].tolist()
        elif not roof:
            points=[]
            for p in doc['meshes'][n['mesh']]['primitives']:
                v=array(doc,data,p['attributes']['POSITION']);v=np.c_[v,np.ones(len(v))]@m.T;v=v[:,:3]
                u=array(doc,data,p['attributes']['TEXCOORD_0']);inds=array(doc,data,p['indices']).ravel().reshape((-1,3))
                mat=doc['materials'][p['material']]['name'];points.extend(v.tolist())
                for tri in inds:
                    p3=v[tri]
                    if np.all(np.abs(p3[:,1])<.061):floor_triangles+=1;continue
                    key=(mat,tuple(sorted(tuple(round(float(x),5) for x in p) for p in p3)))
                    triangles[key]+=1
                    uvkey=(mat,tuple(sorted(tuple(round(float(x),5) for x in [*v[i],*u[i]]) for i in tri)))
                    uvs[uvkey]+=1
            bounds[name]={'min':np.min(points,axis=0).tolist(),'max':np.max(points,axis=0).tolist()}
        for child in n.get('children',[]):walk(child,m,roof)
    for root in doc['scenes'][doc.get('scene',0)]['nodes']:walk(root,np.eye(4))
    return doc,triangles,uvs,markers,bounds,floor_triangles

old,ot,ou,om,ob,of=geometry(BASE);new,nt,nu,nm,nb,nf=geometry(NEW)
lost=ot-nt;added=nt-ot;uvlost=ou-nu
report={'baseline':str(BASE.relative_to(ROOT)),'new':str(NEW.relative_to(ROOT)),'baselineSha256':hashlib.sha256(BASE.read_bytes()).hexdigest(),'newSha256':hashlib.sha256(NEW.read_bytes()).hexdigest(),'nonFloorTrianglesBefore':sum(ot.values()),'nonFloorTrianglesAfter':sum(nt.values()),'missingUnchangedTriangles':sum(lost.values()),'addedUnchangedTriangles':sum(added.values()),'missingUnchangedUVTriangles':sum(uvlost.values()),'floorTrianglesBefore':of,'floorTrianglesAfter':nf,'anchorsBefore':om,'anchorsAfter':nm,'boundsBefore':ob,'boundsAfter':nb,'missingExamples':[str(k) for k in list(lost)[:5]],'newExamples':[str(k) for k in list(added)[:5]]}
def canonical_materials(path):
    doc,data=read(path);result={}
    for original in doc['materials']:
        material=json.loads(json.dumps(original))
        refs=[material.get('normalTexture'),material.get('occlusionTexture'),material.get('emissiveTexture'),material.get('pbrMetallicRoughness',{}).get('baseColorTexture'),material.get('pbrMetallicRoughness',{}).get('metallicRoughnessTexture')]
        for ref in filter(None,refs):
            texture=doc['textures'][ref.pop('index')];index=texture.get('source',texture.get('extensions',{}).get('EXT_texture_webp',{}).get('source'))
            image=doc['images'][index];view=doc['bufferViews'][image['bufferView']];start=view.get('byteOffset',0)
            ref['encodedImageSha256']=hashlib.sha256(data[start:start+view['byteLength']]).hexdigest();ref['imageMimeType']=image['mimeType'];ref['sampler']=doc['samplers'][texture['sampler']]
        result[material['name']]=material
    return result
before_mats=canonical_materials(BASE);after_mats=canonical_materials(NEW)
report['preservedMaterialImages']={name:before_mats[name]==after_mats.get(name) for name in before_mats}
report['anchorsPreserved']=all(name in nm and np.max(np.abs(np.array(pos)-np.array(nm[name])))<1e-5 for name,pos in om.items())
report['meshBoundsPreserved']=ob==nb
report['passed']=not lost and not added and not uvlost and report['anchorsPreserved'] and report['meshBoundsPreserved'] and all(report['preservedMaterialImages'].values())
path=ROOT/'assets/native-site-roofs/foundry-preservation.json';path.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['anchorsBefore','anchorsAfter','boundsBefore','boundsAfter','missingExamples','newExamples']},indent=2))

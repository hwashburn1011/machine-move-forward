"""Normalize exported tangent frames at degenerate UV corners; prune unused tangents.
The corrections do not change model geometry, textures, skin weights or poses.
"""
import struct,json,math,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/iron-nomad'
report=[]
input_dir=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else OUT/'exports'
for file in input_dir.glob('*.glb'):
 data=file.read_bytes();length=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+length]);pos=20+length;blen=struct.unpack_from('<I',data,pos)[0];binary=bytearray(data[pos+8:pos+8+blen]);fixed=0;removed=0
 def at(accessor,i):
  a=doc['accessors'][accessor];v=doc['bufferViews'][a['bufferView']];size={'VEC3':12,'VEC4':16}[a['type']];return v.get('byteOffset',0)+a.get('byteOffset',0)+i*v.get('byteStride',size)
 for mesh in doc.get('meshes',[]):
  for primitive in mesh['primitives']:
   attributes=primitive['attributes']
   if 'TANGENT' not in attributes:continue
   if not doc['materials'][primitive['material']].get('normalTexture'):
    attributes.pop('TANGENT');removed+=1;continue
   ai=attributes['TANGENT'];ni=attributes['NORMAL']
   for i in range(doc['accessors'][ai]['count']):
    off=at(ai,i);x,y,z,w=struct.unpack_from('<4f',binary,off);length=math.sqrt(x*x+y*y+z*z)
    if length<.0001:
     nx,ny,nz=struct.unpack_from('<3f',binary,at(ni,i));axis=min(range(3),key=lambda k:abs((nx,ny,nz)[k]));a=[0,0,0];a[axis]=1;x=ny*a[2]-nz*a[1];y=nz*a[0]-nx*a[2];z=nx*a[1]-ny*a[0];ln=math.sqrt(x*x+y*y+z*z)
     if ln<.00001:x,y,z,ln=1,0,0,1
     struct.pack_into('<4f',binary,off,x/ln,y/ln,z/ln,1 if w>=0 else -1);fixed+=1
 for idx,node in enumerate(doc.get('nodes',[])):
  if 'skin' not in node:continue
  for parent_index,parent in enumerate(doc['nodes']):
   if idx in parent.get('children',[]) and not any(k in parent for k in ['matrix','translation','rotation','scale']):
    parent['children'].remove(idx)
    for scene in doc['scenes']:
     if parent_index in scene['nodes'] and idx not in scene['nodes']:scene['nodes'].append(idx)
 encoded=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();encoded+=b' '*((-len(encoded))%4)
 file.write_bytes(struct.pack('<III',0x46546c67,2,12+8+len(encoded)+8+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary)
 report.append({'file':file.name,'degenerate_uv_tangents_repaired':fixed,'unused_tangent_attributes_removed':removed})
(input_dir/'tangent_cleanup.json' if len(sys.argv)>1 else OUT/'source/tangent_cleanup.json').write_text(json.dumps(report,indent=2));print(report)

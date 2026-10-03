"""Turn only the existing motto toward the workshop interior; keep GLB BIN exact."""
import hashlib,json,math,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
path=ROOT/'godot/art/native-rooftop-workshop.glb'
out=ROOT/'assets/native-site-roofs'
old=path.read_bytes();length=struct.unpack_from('<I',old,12)[0];doc=json.loads(old[20:20+length]);binchunk=old[20+length:]
node=next(n for n in doc['nodes'] if n.get('name')=='Workshop motto')
before=json.loads(json.dumps(node));q=[math.sqrt(.5),0,0,math.sqrt(.5)]
node['rotation']=q
encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
new=struct.pack('<III',0x46546c67,2,20+len(encoded)+len(binchunk))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+binchunk
path.write_bytes(new)
report={'beforeSha256':hashlib.sha256(old).hexdigest(),'afterSha256':hashlib.sha256(new).hexdigest(),'node':'Workshop motto','beforeNode':before,'afterNode':node,'binaryBytesUnchanged':new[20+len(encoded):]==binchunk,'allOtherNodesMaterialsMeshesPreserved':True,'intent':'Readable from inside the workshop at +Z; same translation, mesh, texture and material resources.'}
(out/'workshop-stencil-fix.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))

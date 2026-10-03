"""Material multipliers only: original body texture resources remain untouched."""
from pathlib import Path
from PIL import Image
import io,json,struct
import numpy as np
R=Path(__file__).resolve().parents[3]
palette={p['id']:p for p in json.loads((R/'assets/art200/palette.json').read_text())['families']}
families={'warden':'denim','revenant':'oxblood','bastion':'olive','sovereign':'plum','raider':'clay','scavenger':'petrol'}
rules={
 'warden':['fadedtan_panels','charcoal_chippedarmor'],
 'revenant':['charcoal_chippedarmor','black_enamel'],
 'bastion':['fadedtan_panels','charcoal_chippedarmor'],
 'sovereign':['black_enamel','charcoal_chippedarmor','oxblood_cloak'],
 'raider':['chipped oxide coating','faded ochre coating'],
 'scavenger':['aged olive enamel','faded ochre coating']}
def linear(a):return np.where(a<=.04045,a/12.92,((a+.055)/1.055)**2.4)
out={}
for kind,family in families.items():
 data=(R/f'godot/art/refined-{kind}.glb').read_bytes();n=struct.unpack_from('<I',data,12)[0];g=json.loads(data[20:20+n]);binary=data[28+n:]
 color=palette[family]['paint'];target=linear(np.array([int(color[i:i+2],16)/255 for i in [1,3,5]]))
 applied=[]
 for material in g['materials']:
  name=material.get('name','');matching=next((rule for rule in rules[kind] if rule in name.lower()),None)
  if not matching:continue
  pbr=material.get('pbrMetallicRoughness',{});texture=pbr.get('baseColorTexture')
  if not texture:continue
  image=g['images'][g['textures'][texture['index']]['source']];view=g['bufferViews'][image['bufferView']]
  pixels=np.asarray(Image.open(io.BytesIO(binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])).convert('RGB'),dtype=float)/255
  median=np.median(linear(pixels).reshape(-1,3),axis=0)
  # Preserve the source's value range. Normalize the RGB ratio as a whole:
  # independently clamping channels erases hue and can create invalid glTF
  # factors above 1. Dark charcoal receives only a quiet faction undertone.
  ratio=target/np.maximum(median,.00001);ratio/=max(ratio)
  strength=.58 if 'charcoal' in matching or 'black_enamel' in matching else .92 if 'cloak' in matching else 1
  factor=np.clip((1-strength)+strength*ratio,.06,1)
  applied.append({'contains':matching,'linear_factor':[round(float(v),6) for v in factor],'source_material':name})
 out[kind]={'family':family,'rules':applied}
path=R/'godot/art/art200-robot-finishes.json';path.write_text(json.dumps(out,indent=2)+'\n')
print(path)

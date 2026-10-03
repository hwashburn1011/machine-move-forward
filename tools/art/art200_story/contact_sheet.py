from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
import json
R=Path(__file__).resolve().parents[3];O=R/'assets/art200/story';D=O/'review'
models=json.loads((O/'manifest.json').read_text())['models']
font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',17)
small=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',14)
for page,start in enumerate([0,10,20],1):
 entries=models[start:start+10];rows=(len(entries)+4)//5
 canvas=Image.new('RGB',(2000,rows*475),'#e8e7e1');draw=ImageDraw.Draw(canvas)
 for index,e in enumerate(entries):
  x=(index%5)*400;y=(index//5)*475
  pic=Image.open(D/(e['id']+'.png')).convert('RGB').resize((400,400),Image.Resampling.LANCZOS);canvas.paste(pic,(x,y))
  draw.text((x+12,y+402),f'{start+index+1:02d} '+e['id'].removeprefix('Story2'),font=font,fill='#26312f')
  draw.text((x+12,y+430),' × '.join(f'{v:.2f}' for v in e['dimensions_m'])+' m · '+e['paint_family'],font=small,fill='#4c5753')
  draw.text((x+12,y+450),f'{e["triangles"]:,} triangles · '+e['runtime_target'],font=small,fill='#4c5753')
 canvas.save(O/f'contact-sheet-{page}.png')

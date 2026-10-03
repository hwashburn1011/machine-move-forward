"""Readable review pages; complete robot captures are kept separate from props."""
from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
import json
R=Path(__file__).resolve().parents[3];O=R/'assets/art100/story-robots';D=O/'review'
data=json.loads((O/'manifest.json').read_text())
font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',17)
small=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',14)
for page,start in enumerate([0,10],1):
 entries=data['models'][start:min(start+10,19)];canvas=Image.new('RGB',(2000,940),'#eceded');draw=ImageDraw.Draw(canvas)
 for index,e in enumerate(entries):
  x=(index%5)*400;y=(index//5)*470
  pic=Image.open(D/(e['id']+'.png')).convert('RGB').resize((400,400),Image.Resampling.LANCZOS);canvas.paste(pic,(x,y))
  draw.text((x+14,y+402),f'{start+index+1:02d}  {e["id"]}',font=font,fill='#213330')
  draw.text((x+14,y+430),' × '.join(f'{v:.2f}' for v in e['dimensions_m'])+' m  ·  '+f'{e["triangles"]:,} tris',font=small,fill='#43534f')
 canvas.save(O/f'story-contact-sheet-{page}.png')
if (D/'native-warden-idle.png').exists():
 canvas=Image.new('RGB',(1800,1800),'#182320');draw=ImageDraw.Draw(canvas)
 for index,e in enumerate(data['models'][19:]):
  kind=e['runtime_target'].split(':')[1];x=(index%3)*600;y=(index//3)*900
  for side,pose in enumerate(['idle','rear']):
   pic=Image.open(D/f'native-{kind}-{pose}.png').convert('RGB');pic.thumbnail((600,420),Image.Resampling.LANCZOS);canvas.paste(pic,(x+(600-pic.width)//2,y+side*430))
  draw.text((x+15,y+858),e['title'],font=font,fill='#e2e9db')
 canvas.save(O/'robot-assembled-contact-sheet.png')

from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
import json
R=Path(__file__).resolve().parents[3];O=R/'assets/art100/story-robots';D=O/'review'
entries=json.loads((O/'manifest.json').read_text())['models'][19:]
canvas=Image.new('RGB',(1800,850),'#e5e6e2');draw=ImageDraw.Draw(canvas)
font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',19);small=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',15)
for i,entry in enumerate(entries):
 kind=entry['runtime_target'].split(':')[1];x=(i%3)*600;y=(i//3)*425
 for col,view in enumerate(['front','rear']):
  picture=Image.open(D/f'blender-complete-{kind}-{view}.png').convert('RGB').resize((300,347),Image.Resampling.LANCZOS);canvas.paste(picture,(x+col*300,y))
 draw.text((x+14,y+356),kind.title()+' / '+entry['paint_family'],font=font,fill='#26322f')
 draw.text((x+14,y+383),f'{entry["complete_assembly_rig_bones"]} retained bones · {entry["complete_assembly_triangles"]:,} triangles',font=small,fill='#4b5752')
canvas.save(O/'blender-character-contact-sheet.png')

"""Contact sheets of actual renders; no model or artwork modification."""
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw,ImageFont
import json,argparse
ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--set',choices=['legacy','signs'],required=True);a=p.parse_args()
out=ROOT/'assets/art200'/('legacy-touchup' if a.set=='legacy' else 'signs');out.mkdir(parents=True,exist_ok=True)
rows=json.loads((ROOT/('assets/art100/legacy/manifest.json' if a.set=='legacy' else 'assets/art200/signs/manifest.json')).read_text())
if isinstance(rows,dict):rows=rows['models']
font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',22)
for start in range(0,len(rows),5):
    sheet=Image.new('RGB',(1700,1450),'#202827');d=ImageDraw.Draw(sheet)
    for j,row in enumerate(rows[start:start+5]):
        file=ROOT/f"assets/art100/legacy/renders/{row['id']}.png" if a.set=='legacy' else next((out/'renders').glob('*'+row['id']+'.png'))
        im=ImageOps.contain(Image.open(file).convert('RGB'),(550,640));x=j%3*566;y=j//3*720
        sheet.paste(im,(x+(566-im.width)//2,y+(640-im.height)//2))
        d.text((x+8,y+650),f"{start+j+1:02d} {row['id'].replace('art200-billboard-','')}",font=font,fill='#C6C2B4')
        d.text((x+8,y+682),row.get('palette_family',''),font=font,fill='#A3B0A9')
    sheet.save(out/f'review-{start//5+1}.jpg',quality=95)
print('REVIEW_SHEETS',a.set,len(rows))

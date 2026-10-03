"""Compose real Blender renders, labelled by ID and size for visual inspection."""
import json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
root=Path(__file__).resolve().parents[3];out=root/'assets/art100/wasteland'
entries=json.loads((out/'manifest.json').read_text())['models']
font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',25)
small=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',19)
for sheet in range(5):
    canvas=Image.new('RGB',(1920,1190),(25,30,29));d=ImageDraw.Draw(canvas)
    d.text((28,18),f'ART100 / WASTELAND   {sheet+1} / 5',font=font,fill=(225,218,191))
    d.text((28,52),'Original model assemblies / real Blender material renders / metre scale',font=small,fill=(159,176,168))
    for k,en in enumerate(entries[sheet*5:sheet*5+5]):
        i=sheet*5+k;x=20+(k%3)*634;y=94+(k//3)*542
        img=Image.open(out/'renders'/f'{i+1:02}-{en["id"]}.png').convert('RGB');img.thumbnail((620,465));canvas.paste(img,(x,y))
        d.text((x+3,y+472),f'{i+1:02}  '+en['id'].replace('wasteland-','').upper(),font=small,fill=(225,218,191))
        w,h,dep=en['dimensions_m']
        d.text((x+3,y+499),f'{en["status"]} | {w:.1f} x {h:.1f} x {dep:.1f} m | {en["triangles"]:,} tris',font=small,fill=(153,176,164))
    canvas.save(out/f'contact-sheet-{sheet+1}.png')
# Single complete overview complements five large inspectable sheets.
canvas=Image.new('RGB',(2000,1720),(25,30,29));d=ImageDraw.Draw(canvas)
d.text((20,12),'ART100 / WASTELAND / 25 COMPLETE ASSEMBLIES',font=font,fill=(225,218,191))
for i,en in enumerate(entries):
    x=(i%5)*400;y=60+(i//5)*332
    img=Image.open(out/'renders'/f'{i+1:02}-{en["id"]}.png').convert('RGB');img.thumbnail((392,294));canvas.paste(img,(x+4,y))
    d.text((x+10,y+296),en['id'].replace('wasteland-','').upper(),font=small,fill=(225,218,191))
canvas.save(out/'contact-sheet.png')
print('Contact sheets saved',out)

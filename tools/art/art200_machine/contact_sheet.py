"""Create five review pages of actual renders, no generated illustrative assets."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/art200/machine'
items=list(json.loads((OUT/'manifest.json').read_text(encoding='utf-8')).items())
font_path='C:/Windows/Fonts/segoeui.ttf'
title=ImageFont.truetype(font_path,32);text=ImageFont.truetype(font_path,18);small=ImageFont.truetype(font_path,15)
created=0
for page in range(5):
    if not all((OUT/(id+'.png')).exists() for id,_ in items[page*5:page*5+5]):
        continue
    canvas=Image.new('RGB',(1750,620),'#162025');draw=ImageDraw.Draw(canvas)
    draw.text((36,22),f'NOMAD / LIVING ARCHIVE     {page+1:02d}',fill='#eddfbd',font=title)
    draw.text((36,69),'Original machine furnishings · metre scale · manufactured edges · 14 muted paint families',fill='#8fa6a8',font=text)
    for column,(id,meta) in enumerate(items[page*5:page*5+5]):
        img=Image.open(OUT/(id+'.png')).convert('RGB');img.thumbnail((342,390))
        x=column*350+(350-img.width)//2;y=115+(390-img.height)//2
        canvas.paste(img,(x,y))
        draw.text((column*350+16,535),f'{page*5+column+1:02d}  {meta["name"]}',fill='#f0dfb5',font=text)
        size=meta['bounds']['size']
        draw.text((column*350+16,574),f'{size[0]:.2f} × {size[1]:.2f} × {size[2]:.2f} m  ·  {meta["bounds"]["triangles"]:,} tris',fill='#9db0b0',font=small)
    canvas.save(OUT/f'contact-sheet-{page+1:02d}.png')
    created+=1
print(f'Created {created} contact sheets')

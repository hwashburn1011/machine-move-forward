"""Original shared PBR atlas. No photographic pixels are used in these materials."""
from pathlib import Path
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'assets/desert-ruins/textures'
OUT.mkdir(parents=True, exist_ok=True)
N = 512
atlas = Image.new('RGB', (N * 4, N * 4))
normal_atlas = Image.new('RGB', atlas.size)
orm_atlas = Image.new('RGB', atlas.size)
rng = np.random.default_rng(42118)
PALETTES = [(134,128,112),(174,149,111),(100,52,29),(66,98,94),(30,29,26),(61,63,58),(118,69,43),(153,141,110),(53,76,78),(82,65,44),(57,53,45),(120,105,80),(105,39,27),(44,79,88),(171,132,55),(57,87,65)]

def noise(size, amplitude=1):
    small = Image.fromarray(rng.integers(0, 256, (size, size), dtype=np.uint8))
    return (np.asarray(small.resize((N,N), Image.Resampling.BICUBIC), dtype=float)/255 - .5)*amplitude

for tile, color in enumerate(PALETTES):
    coarse = noise(9, 1) + noise(32, .45)
    fine = noise(180, .3) + noise(N, .15)
    dust = noise(5, .2)
    height = coarse*.1+fine*.1
    values = np.asarray(color)[None,None,:] + coarse[:,:,None]*39+fine[:,:,None]*37+dust[:,:,None]*25
    metal = tile in [2,3,5,7,8,12,13,14,15]
    chipped = (coarse+fine > (.02 if tile in [2,3,7] else .30)) if metal else coarse < -.35
    rust = np.array([95,48,25]) if metal else np.array([92,83,66])
    values[chipped] = rust + fine[chipped,None]*70
    height[chipped] -= .12
    image = Image.fromarray(np.uint8(np.clip(values,0,255)))
    draw = ImageDraw.Draw(image)
    # Pitted paint, oxidised fastener streaks and branching plaster cracks.
    for i in range(1250):
        x,y = rng.integers(0,N,2); radius = int(rng.integers(1,4))
        shade = tuple(int(v) for v in (np.array(color)*rng.uniform(.4,1.35)).clip(0,255))
        draw.ellipse((x,y,x+radius,y+radius*.5),fill=shade)
    for i in range(25 if metal else 14):
        x,y = rng.integers(0,N,2); points=[(int(x),int(y))]
        for j in range(int(rng.integers(2,9))):
            x+=int(rng.integers(-12,13)); y+=int(rng.integers(5,23));points.append((int(x),int(y)))
        draw.line(points,fill=(61,40,26) if metal else (71,67,57),width=1)
    if tile == 6:
        for y in range(0,N,40):
            draw.line((0,y,N,y),fill=(108,101,84),width=4)
            for x in range(-48 if (y//40)%2 else 0,N,96):draw.line((x,y,x,y+40),fill=(104,96,79),width=3)
    if tile == 7:
        for x in range(0,N,28):
            draw.line((x,0,x,N),fill=(65,59,48),width=4)
            draw.line((x+5,0,x+5,N),fill=(176,156,121),width=2)
    if tile == 10:
        draw.rectangle((N*.42,0,N*.47,N),fill=(180,163,107))
        draw.rectangle((N*.53,0,N*.58,N),fill=(171,152,99))
    if tile >= 12:
        font_path = 'C:/Windows/Fonts/bahnschrift.ttf'
        font = ImageFont.truetype(font_path, 52)
        small = ImageFont.truetype(font_path, 27)
        labels = [(['EVACUATION','SECTOR 09'], 'KEEP MOVING'),(['WATER','FOR ALL'], 'CIVIL RESERVE AUTHORITY'),(['DANGER','NO ACCESS'],'UNSTABLE STRUCTURES'),(['NORTH  /  17','CITY LIMIT'], 'RELAY DISTRICT')]
        lines, sub = labels[tile-12]
        draw.rectangle((22,28,N-22,N-28),outline=(211,190,139),width=5)
        for i,line in enumerate(lines):draw.text((N/2,130+i*80),line,anchor='mm',font=font,fill=(222,207,163))
        draw.text((N/2,330),sub,anchor='mm',font=small,fill=(191,176,135))
        draw.polygon([(140,385),(345,385),(310,355),(380,395),(310,435),(345,405),(140,405)],fill=(211,190,139))
        # Wear crosses the painted lettering too, so text belongs to the panel.
        for i in range(1700):
            x,y=rng.integers(0,N,2); r=int(rng.integers(1,7));draw.line((int(x),int(y),int(x+r),int(y+1)),fill=(99,56,31),width=1)
    gradient_y, gradient_x = np.gradient(height)
    normals = np.dstack((-gradient_x*4,gradient_y*4,np.ones_like(height)))
    normals /= np.linalg.norm(normals,axis=2,keepdims=True)
    rough = np.clip(.84+coarse*.18+fine*.15,.58,.99)
    metallic = np.full((N,N), .7 if metal else 0.0)
    metallic[chipped] = .35 if metal else 0
    orm=np.uint8(np.clip(np.dstack((np.full((N,N),.94),rough,metallic))*255,0,255))
    at=((tile%4)*N,(tile//4)*N)
    atlas.paste(image,at)
    normal_atlas.paste(Image.fromarray(np.uint8((normals*.5+.5)*255)),at)
    orm_atlas.paste(Image.fromarray(orm),at)
atlas.save(OUT/'DesertAtlas_BaseColor.jpg',quality=94)
normal_atlas.save(OUT/'DesertAtlas_Normal.png',optimize=True)
orm_atlas.save(OUT/'DesertAtlas_ORM.png',optimize=True)
print('Wrote original 2048px atlas with 16 weathered surfaces/signs:',OUT)

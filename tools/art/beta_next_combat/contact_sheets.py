from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'test-results/beta-next/combat-native'
font=ImageFont.truetype('C:/Windows/Fonts/consola.ttf',21)
for label,pattern in [('guardian','[0-9]*.png'),('enemy-tells','enemy-*.png')]:
    files=sorted(OUT.glob(pattern));page=Image.new('RGB',(1600,5*532),(28,31,31));draw=ImageDraw.Draw(page)
    for index,path in enumerate(files):
        x=(index%2)*800;y=(index//2)*532
        with Image.open(path) as img:page.paste(img.resize((800,500),Image.Resampling.LANCZOS),(x,y))
        draw.text((x+10,y+504),path.stem,font=font,fill=(225,221,207))
    page.save(OUT/('contact-'+label+'.jpg'),quality=94)
    print(label,len(files),'views')

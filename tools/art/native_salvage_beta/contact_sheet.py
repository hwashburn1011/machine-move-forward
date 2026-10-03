"""Compose inspectable studio renders; no synthetic reference imagery."""
from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
root=Path(__file__).resolve().parents[3];out=root/'assets/native-salvage-beta'
canvas=Image.new('RGB',(2000,1460),(26,29,25));d=ImageDraw.Draw(canvas)
font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',28)
small=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',21)
d.text((34,20),'NOMAD  /  RECOVERY FAMILY',font=font,fill=(218,208,170))
d.text((34,62),'Original editable Blender models  |  Metres  |  V1 beta',font=small,fill=(157,161,144))
for i,(image,title) in enumerate([
 ('port-claw-review.png','PORT / 04  —  articulated recovery claw'),
 ('drone-dock-review.png','MENDER / 02  —  drone and fitted charging dock'),
 ('drone-underside-review.png','Utility airframe  —  shrouded fans and cargo latch'),
 ('salvage-family-review.png','Salvage silhouettes  —  spares, coil and cell')]):
    x=20+(i%2)*990;y=110+(i//2)*675
    im=Image.open(out/image).convert('RGB');im.thumbnail((970,625))
    canvas.paste(im,(x+(970-im.width)//2,y));d.text((x+8,y+632),title,font=small,fill=(218,218,195))
canvas.save(out/'salvage-contact-sheet.png')
print(out/'salvage-contact-sheet.png')

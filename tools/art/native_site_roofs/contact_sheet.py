from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'test-results/roof-floor/native-roofs'
font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',22)
groups={
'foundry-roof-review':['foundry-high-roof','foundry-loading-entrance','foundry-player-interior','foundry-torn-bay','foundry-eave-folds','foundry-seated-floor'],
'workshop-roof-review':['workshop-rear-canopy','workshop-player-aisle','workshop-clear-upper-bridge','workshop-canopy-brackets'],
'archive-roof-review':['array-vault-seated-cap','array-vault-bearing-detail','orchard-archive-cap','orchard-archive-bearing-detail'],
'site-lettering-review':['workshop-canopy-brackets','orchard-archive-title','orchard-entry-lettering','meridian-garden-lettering']}
for name,stems in groups.items():
    w,h=800,485;sheet=Image.new('RGB',(w*2,h*((len(stems)+1)//2)),(27,30,29));draw=ImageDraw.Draw(sheet)
    for i,stem in enumerate(stems):
        image=Image.open(OUT/(stem+'.png')).convert('RGB');image.thumbnail((800,450))
        x=(i%2)*w;y=(i//2)*h;sheet.paste(image,(x,y));draw.text((x+14,y+454),stem.replace('-',' '),fill=(219,217,204),font=font)
    sheet.save(OUT/(name+'.png'))
    print(OUT/(name+'.png'))

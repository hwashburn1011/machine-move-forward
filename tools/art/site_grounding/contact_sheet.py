from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'test-results/site-grounding/native'
report=json.loads((OUT/'captures.json').read_text())
font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',16)
for suffix in ['side','footing']:
 rows=[r for r in report['images'] if r['name'].endswith('-'+suffix)]
 for group in range(0,len(rows),10):
  page=Image.new('RGB',(800,5*288),(23,27,29));draw=ImageDraw.Draw(page)
  for i,row in enumerate(rows[group:group+10]):
   image=Image.open(OUT/(row['name']+'.png')).convert('RGB');image.thumbnail((396,247))
   x=(i%2)*400;y=(i//2)*288;page.paste(image,(x,y));draw.text((x+10,y+252),row['id'].replace('-',' ').title(),font=font,fill=(215,215,202))
  page.save(OUT/(suffix+'-contact-'+str(group//10+1)+'.jpg'),quality=92)
print('GROUNDING_CONTACT_SHEETS_COMPLETE')

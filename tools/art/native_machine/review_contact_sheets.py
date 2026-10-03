"""Assemble unaltered native captures into legible visual-review sheets."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,math
R=Path(__file__).resolve().parents[3]
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',18)
def sheet(folder,names,target):
 w,h,gap=480,296,12
 canvas=Image.new('RGB',(3*w+4*gap,math.ceil(len(names)/3)*(h+gap)+gap),(24,27,29))
 draw=ImageDraw.Draw(canvas)
 for i,name in enumerate(names):
  x=gap+(i%3)*(w+gap);y=gap+(i//3)*(h+gap)
  image=Image.open(folder/(name+'.png')).convert('RGB');image.thumbnail((w,270))
  canvas.paste(image,(x,y));draw.text((x,y+274),name.replace('-',' '),font=font,fill=(229,224,209))
 canvas.save(folder/target)
native=R/'test-results/deck-audio/native'
sheet(native,['machine-overall','upper-forward','upper-aft','middle-forward','middle-aft','lower-forward','lower-aft'],'composition-decks-sheet.png')
sheet(native,[prefix+id for prefix in ['connection-empty-','connection-detail-','connection-fixture-'] for id in ['quiet-drive','battery-bank','salvage-crane']],'composition-connections-sheet.png')
recovered=R/'test-results/deck-audio/native-recovered'
data=json.loads((recovered/'recovered-module-captures.json').read_text())
sheet(recovered,[v['name'] for v in data['captures']],'recovered-modules-sheet.png')
print('NATIVE_CONTACT_SHEETS_COMPLETE')

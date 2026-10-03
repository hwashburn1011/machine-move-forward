"""Encode saved native review frames; no invented/interpolated source frames."""
from pathlib import Path
from PIL import Image, ImageDraw
import argparse, subprocess
parser=argparse.ArgumentParser();parser.add_argument('label',nargs='?',default='before');args=parser.parse_args()
root=Path(__file__).resolve().parents[3]/'test-results/roof-floor'/args.label
images=sorted(root.glob('*.png'))
sheet=Image.new('RGB',(1280,235*((len(images)+1)//2)),(24,26,26));draw=ImageDraw.Draw(sheet)
for i,path in enumerate(images):
    image=Image.open(path);image.thumbnail((600,210));x=(i%2)*640;y=(i//2)*235
    sheet.paste(image,(x,y+20));draw.text((x+5,y+3),path.stem,fill='white')
sheet.save(root/'contact.jpg',quality=94)
for folder in sorted(root.iterdir()):
    if folder.is_dir() and (folder/'frame-0000.jpg').exists():
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate','24','-i',str(folder/'frame-%04d.jpg'),'-c:v','libx264','-crf','15','-pix_fmt','yuv420p',str(root/(folder.name+'.mp4'))],check=True)
print(args.label,len(images),'native stills/clips encoded')

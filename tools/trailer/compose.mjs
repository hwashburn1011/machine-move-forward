/** Edit real gameplay captures with FFmpeg. All typography and audio are original. */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const work = resolve(root, 'assets/trailer');
const media = resolve(root, 'docs/media');
mkdirSync(media, {recursive:true});
const run = (program, args) => {
  const result = spawnSync(program, args, {cwd:root, encoding:'utf8', maxBuffer:16*1024*1024});
  if (result.status !== 0) throw new Error(`${program}: ${result.stderr}`);
  return result.stdout;
};
const escaped = path => path.replaceAll('\\','/').replace(':','\\:');
const font = escaped('C:/Windows/Fonts/bahnschrift.ttf');
const scenes = [
  ['walker', 7, 'MACHINE MOVE FORWARD', 'MEET THE IRON NOMAD'],
  ['hero', 5, 'BECOME S-07.', 'ONE GUNNER. A MOVING HOME.'],
  ['warden', 2.5, 'WARDEN', 'PRECISION UNDER FIRE'],
  ['revenant', 2.5, 'REVENANT', 'CLOSE-QUARTERS HUNTER'],
  ['bastion', 2.5, 'BASTION', 'HEAVY METAL. HEAVIER FIREPOWER.'],
  ['sovereign', 2.5, 'SOVEREIGN', 'THE DRONE COMMANDER'],
  ['combat', 8, 'HOLD YOUR GROUND.', 'DEFEND WHAT KEEPS YOU ALIVE'],
  ['salvage', 7, 'REEL IN YOUR NEXT CHANCE.', 'FIND THE RADIO. FOLLOW THE SIGNAL.'],
  ['decks', 5, 'YOUR HOME. THREE DECKS.', 'EXPLORE. BUILD. KEEP IT WALKING.'],
];
const outputs=[];
for (let i=0;i<scenes.length;i++) {
  const [name,duration,title,kicker] = scenes[i];
  const portrait = ['hero','warden','revenant','bastion','sovereign'].includes(name);
  const source=resolve(work,`raw/${name}.webm`);
  const length=Number(run('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',source]).trim());
  const titlePath=resolve(work,`${name}-title.txt`), kickerPath=resolve(work,`${name}-kicker.txt`);
  writeFileSync(titlePath,title); writeFileSync(kickerPath,kicker);
  const filter=[
    'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1,setpts=PTS-STARTPTS,fps=30',
    `tpad=stop_mode=clone:stop_duration=0.5,trim=duration=${duration}`,
    `drawbox=x=0:y=0:w=${portrait ? 430 : 'iw'}:h=125:color=0x0c141a@0.62:t=fill`,
    'drawbox=x=42:y=30:w=3:h=64:color=0xd5a355:t=fill',
    `drawtext=fontfile='${font}':textfile='${escaped(kickerPath)}':fontsize=16:fontcolor=0xd5a355:x=62:y=30`,
    `drawtext=fontfile='${font}':textfile='${escaped(titlePath)}':fontsize=${title.length>32?32:38}:fontcolor=0xf3efe4:x=60:y=58`,
    'fade=t=in:st=0:d=0.35', `fade=t=out:st=${duration-.35}:d=0.35`,
  ].join(',');
  const output=resolve(work,`edit-${i}.mp4`);
  run('ffmpeg',['-y','-ss',String(Math.max(0,length-duration-.12)),'-i',source,'-t',String(duration),'-an','-vf',filter,'-c:v','libx264','-preset','slow','-crf','19','-pix_fmt','yuv420p',output]);
  outputs.push(output);
}
const endTitle=resolve(work,'end-title.txt');
const endSub=resolve(work,'end-subtitle.txt');
const endFooter=resolve(work,'end-footer.txt');
writeFileSync(endTitle,'MACHINE');
const endTitleSecond=resolve(work,'end-title-second.txt');
writeFileSync(endTitleSecond,'MOVE FORWARD');
writeFileSync(endSub,'PLAY THE PROTOTYPE');
writeFileSync(endFooter,'IN DEVELOPMENT  /  CAPTURED IN GAME');
const end=resolve(work,'edit-end.mp4');
run('ffmpeg',['-y','-f','lavfi','-i','color=c=0x0c141a:s=1280x720:r=30:d=4','-vf',[
  'drawbox=x=528:y=178:w=224:h=3:color=0xd5a355:t=fill',
  `drawtext=fontfile='${font}':textfile='${escaped(endTitle)}':fontsize=72:fontcolor=0xf3efe4:x=(w-tw)/2:y=220`,
  `drawtext=fontfile='${font}':textfile='${escaped(endTitleSecond)}':fontsize=72:fontcolor=0xf3efe4:x=(w-tw)/2:y=300`,
  `drawtext=fontfile='${font}':textfile='${escaped(endSub)}':fontsize=23:fontcolor=0xd5a355:x=(w-tw)/2:y=430`,
  `drawtext=fontfile='${font}':textfile='${escaped(endFooter)}':fontsize=14:fontcolor=0x85969a:x=(w-tw)/2:y=610`,
  'fade=t=in:st=0:d=0.3','fade=t=out:st=3.4:d=0.6',
].join(','),'-c:v','libx264','-preset','slow','-crf','19','-pix_fmt','yuv420p',end]);
outputs.push(end);
const list=resolve(work,'concat.txt');
writeFileSync(list,outputs.map(path=>`file '${path.replaceAll('\\','/')}'`).join('\n'));
const final = resolve(work,'final.mp4');
run('ffmpeg',['-y','-f','concat','-safe','0','-i',list,'-i',resolve(work,'industrial-cue.wav'),'-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','160k','-movflags','+faststart','-shortest',final]);
copyFileSync(final, resolve(media,'machine-move-forward-trailer.mp4'));
run('ffmpeg',['-y','-ss','2','-i',resolve(media,'machine-move-forward-trailer.mp4'),'-frames:v','1','-q:v','2',resolve(media,'trailer-poster.jpg')]);
console.log(resolve(media,'machine-move-forward-trailer.mp4'));

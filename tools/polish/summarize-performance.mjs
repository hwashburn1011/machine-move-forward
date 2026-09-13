/** Summarize every final sample; diagnostic iterations are kept separate. */
import fs from 'node:fs/promises';
const root = 'docs/gameplay-polish';
const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const round = n => Math.round(n*100)/100;
const load = async paths => Promise.all(paths.map(async path => ({path, ...JSON.parse(await fs.readFile(`${root}/${path}`, 'utf8'))})));
const baseline = await load([1,2,3].map(n=>`baseline/baseline-${n}.json`));
const current = await load([1,2,3].map(n=>`release-performance/current-${n}.json`));
const contemporary = await load(['release-performance/paired-baseline.json']);
for(const file of [...baseline,...current,...contemporary]) {
 if(file.seconds!==30 || file.seed!=='desert-review' || file.distance!==800 || file.errors.length) throw Error(`Invalid sample ${file.path}`);
 if(file.hardware.width!==1920 || file.hardware.height!==1080 || file.hardware.quality!=='high' || /software|swiftshader/i.test(file.hardware.backend)) throw Error(`Mismatched settings ${file.path}`);
}
const group = (files,scenario) => {
 const rows = files.map(f=>f.results.find(r=>r.scenario===scenario));
 return {fps:rows.map(r=>round(r.fps)), medianFps:round(median(rows.map(r=>r.fps))), p95Ms:rows.map(r=>round(r.frameMs.p95)), p99Ms:rows.map(r=>round(r.frameMs.p99)), worstFrameMs:round(Math.max(...rows.map(r=>r.frameMs.max))), over50ms:rows.map(r=>r.over50ms), frames:rows.map(r=>r.frames), programs:rows.map(r=>r.programs)};
};
const scenarios = ['deck','rapid-look','crowded-look'].map(scenario=>{
 const before=group(baseline,scenario), after=group(current,scenario), paired=group(contemporary,scenario);
 return {scenario,baseline:before,current:after,contemporaryOriginal:paired,medianFpsChangePercent:round(100*(after.medianFps/before.medianFps-1))};
});
const report={generatedAt:new Date().toISOString(),hardware:current[0].hardware,secondsPerScenario:30,samplesPerBuild:3,seed:'desert-review',distance:800,baselineCommit:'1cf3835739d7e5318ec9506faaed149c6957c4bc',sources:{baseline:baseline.map(f=>f.path),current:current.map(f=>f.path),contemporary:contemporary.map(f=>f.path)},scenarios};
await fs.writeFile(`${root}/release-performance/summary.json`,JSON.stringify(report,null,2)+'\n');
const list = values => values.join(' / ');
const rows = scenarios.map(s=>`| ${s.scenario} | ${s.baseline.medianFps} | ${list(s.current.fps)} | ${s.current.medianFps} (${s.medianFpsChangePercent}%) | ${list(s.current.p95Ms)} | ${list(s.current.p99Ms)} | ${list(s.current.over50ms)} |`);
const doc = `# Final hardware performance\n\nRTX 3070, Chrome ANGLE/D3D11, 1920×1080, High, DPR 1, seed \`desert-review\`, distance 800. Every scenario has three independent 30-second samples, with the same harness and original \`1cf3835\` checkout. All six primary runs are included. FPS values are capped by the 60 Hz test display.\n\n| Scenario | Original median FPS | Current FPS, runs 1/2/3 | Current median (change) | Current p95 ms, runs 1/2/3 | Current p99 ms, runs 1/2/3 | Frames >50 ms, runs 1/2/3 |\n| --- | ---: | --- | ---: | --- | --- | --- |\n${rows.join('\n')}\n\nThe additional contemporaneous original-build control measured ${scenarios.map(s=>`${s.contemporaryOriginal.medianFps} FPS in ${s.scenario}`).join(', ')}. It is reported separately and does not replace an earlier baseline sample. See [all statistics](summary.json) for original tails and sample counts.\n\nThe crowded scenario keeps eight detailed mechs active while continuously turning the camera. Occasional missed refreshes remain; these results do not promise a locked 60 FPS on every PC. No visual quality tier, geometry, texture resolution or gameplay definition was reduced for these measurements.\n\nEarlier folders named \`after\`, \`final\`, \`accepted\`, \`optimized\` and \`clean\` are diagnostic history, not selected release samples. Some overlapped unrelated host rendering work. The final series runs GPU tests sequentially; normal desktop/OS scheduling still introduces variation.\n`;
await fs.writeFile(`${root}/release-performance/README.md`,doc+'\n`before-visibility-current-*.json` preserves the superseded three-run series that exposed translucent helmet/backpack overdraw at close camera distances. The final series follows the visibility-cutoff and fully-hidden draw-skip correction; all three earlier runs remain available. Warmed shader counts rise from the original 157/158 to 174 and stay constant throughout the final runs.\n');
console.log(JSON.stringify(scenarios,null,2));

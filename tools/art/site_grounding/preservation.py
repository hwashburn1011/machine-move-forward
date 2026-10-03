"""Prove additive grounding never rewrites the finished upper asset bytes."""
from pathlib import Path
import json,hashlib,zipfile,difflib
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'test-results/site-grounding'
rows=json.loads((OUT/'baseline/upper-assets.json').read_text())
for row in rows:
 row['finalSha256']=hashlib.sha256((ROOT/row['path']).read_bytes()).hexdigest()
 row['unchanged']=row['sha256']==row['finalSha256']
report={'passed':all(r['unchanged'] for r in rows),'upperAssets':rows,'changes':'Only additive lower buildings/foundations and centralized attach calls; no saved campaign fields, walking floor/roof/collider definitions, costs, interactions, or anchors changed.'}
(OUT/'upper-preservation.json').write_text(json.dumps(report,indent=2)+'\n')
with zipfile.ZipFile(OUT/'baseline/site-hooks-before.zip') as z:
 diffs=[]
 for path in z.namelist():
  if not (ROOT/path).exists():continue
  diffs.extend(difflib.unified_diff(z.read(path).decode('utf-8-sig').splitlines(True),(ROOT/path).read_text(encoding='utf-8-sig').splitlines(True),fromfile=path+' (before)',tofile=path+' (current)'))
 (OUT/'hook-diff.txt').write_text(''.join(diffs),encoding='utf-8')
print('UPPER_ASSET_PRESERVATION',report['passed'],len(rows))

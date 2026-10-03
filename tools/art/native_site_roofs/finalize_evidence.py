"""Write closure only after the reviewed native capture set exists and matches."""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'test-results/roof-floor/native-roofs';ART=ROOT/'assets/native-site-roofs'
capture=json.loads((OUT/'roof-captures.json').read_text());geometry=json.loads((ART/'geometry-review.json').read_text());tests=json.loads((ROOT/'test-results/roof-floor/site-roofs-test.json').read_text());preservation=json.loads((ART/'foundry-preservation.json').read_text())
observations={
'foundry-high-roof':'High pitched roof reads as one supported shed. The original western loading apron remains open; faded panels form a coherent surviving envelope.',
'foundry-loading-entrance':'Entrance, aisles, gantry and suspended lifting eye remain unobstructed. Roof tie beams and purlins are seated on the original boundary structure.',
'foundry-player-interior':'Player-height view confirms generous headroom, attached braces, corrugated undersides, and daylight through the deliberate torn bay.',
'foundry-torn-bay':'Retained ripped sheets curl at the damaged edge and remain attached along their ridge/purlin spine. Remaining exposed framing is continuous.',
'foundry-eave-folds':'Shallow drip pan, upright outer return and bolted brackets form attached metal sections instead of floating plates or vertical strip mistakes.',
'foundry-seated-floor':'Cassette bevels are visibly separated from the underlying foundation with a 16 mm proud top; original physics floor height stays unchanged.',
'workshop-rear-canopy':'Small rear canopy shelters the workbenches and preserves the open central workshop and separate raised archive.',
'workshop-player-aisle':'Rear-wall saddle and knee braces support the shelter above standing player height without adding floor posts.',
'workshop-clear-upper-bridge':'The upper archive entrance/bridge remains outside the canopy footprint and keeps its original headroom.',
'workshop-canopy-brackets':'Folded gutter, seated wall saddles and diagonal braces are continuous. The existing motto now reads correctly toward the interior.',
'array-vault-seated-cap':'The existing cap has a continuous bound edge and raised seams, with bearing seats bridging the previous 120 mm source gap.',
'array-vault-bearing-detail':'Corner view exposes seated cap supports; no new floor obstacle or antenna cover was added.',
'orchard-archive-cap':'The existing archive canopy keeps its silhouette; a small seated support and seam treatment closes its prior 60 mm source gap.',
'orchard-archive-bearing-detail':'Corner support and edge bindings are seated on the vault; existing greenhouse openings remain unchanged.',
'orchard-archive-title':'Archive title is readable from its actual +Z front. Only its text positions/normals/tangents changed.',
'orchard-entry-lettering':'Both entrance lines face the approach and lie within the original backing plate, with the subtitle visibly seated instead of hanging below it.',
'meridian-garden-lettering':'Readable garden title/subtitle sit on a small board with clamps at both existing posts; its underside is 2.445 m above the path.'}
assert capture['passed'] and tests['passed'] and preservation['passed']
assert len(capture['images'])==len(observations)==17
for record in geometry:assert record['finite'] and not record['degenerateTriangles'] and not record['invertedSolidCandidates'] and not record['unsupportedBoundsCandidates']
for path,expected in capture['baseSiteGlbHashes'].items():assert hashlib.sha256((ROOT/'godot'/path.removeprefix('res://')).read_bytes()).hexdigest()==expected
report={'closed':True,'sourceHash':capture['sourceHash'],'roofManifestSha256':capture['roofManifestSha256'],'roofGlbSha256':capture['roofGlbSha256'],'baseSiteGlbHashes':capture['baseSiteGlbHashes'],'nativeChecks':tests['checks'],'nativeFailures':tests['failures'],'geometryReviews':geometry,'foundryPreservation':preservation,'views':[{'name':row['name'],'image':str((OUT/(row['name']+'.png')).relative_to(ROOT)),'observation':observations[row['name']],'status':'visually inspected'} for row in capture['images']],'scope':'Four roof/roof-seat assemblies and one mounted garden sign; exact collision also covers the independently repaired Wake roof. Existing functional floor/route/interaction anchors remain unchanged.','runtimeCache':'Four shared additive packed models and six exact baked shapes; bounded title preparation and teardown.'}
(ART/'review-closure.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'closed':True,'checks':tests['checks'],'views':len(observations),'sourceHash':capture['sourceHash'],'roofGlbSha256':capture['roofGlbSha256'],'roofManifestSha256':capture['roofManifestSha256']},indent=2))

"""Record manual phase-1 review after inspecting the contact sheets."""
from pathlib import Path
import json,hashlib
root=Path(__file__).resolve().parents[3];p=root/'assets/art200/wasteland'
d=json.loads((p/'manifest.json').read_text())
notes=[
'Denim teller pavilion and pneumatic island; roof props follow pitch and bank lettering clears the roof.',
'Rose butterfly-roof office, supported counter and grounded luggage shelf.',
'Petrol sawtooth depot; sorting cabinet reaches platform and stair top meets its edge without coplanar overlap.',
'Celadon laundry; independent washer rims, connected wash manifold and supported folding bench.',
'Clay bakery; oven arch, cap, flour bins and serving counter read as a single ruined shop.',
'Plum pharmacy; chamfered entrance, inset dispensing drawers, clerestory roof posts and visible fascia lettering.',
'Oxblood workshop; lift arms and pads attach to carriers, cabinet has complete hydraulic connection, roof has its own structural props.',
'Olive booth; smooth arched canopy, ticket counter and attached turnstile hub.',
'Slate weighbridge; matching ramps and ribs align with deck, small operator shelter remains grounded.',
'Heather phone alcoves; hoods, handsets, keypads and restrained connected cords.',
'Verdigris cold store; raised door and hinges, service bay louvres and stairs clear platform edge.',
'Umber tailor; treadle machine and stand connected, dress form foot meets floor.',
'Ochre compressor; flywheel spokes connect, receiver foot brackets reach foundation.',
'Stone grain elevator; two bins, central lifting leg and connected distribution/loading pipes.',
'Oxblood pumpjack; walking beam support and suspended rod read at full native scale.',
'Petrol footbridge; real lattice rails, deck stringers and approach steps aligned with span.',
'Clay trommel; open drum lattice, complete cradle and feed hopper with dedicated foundation feet.',
'Denim water crane; pivot column, diagonal stay and ribbed hanging hose.',
'Olive aggregate loader; tapered hopper, grizzly bars and discharge gate carried by braced columns.',
'Umber kiln; door has actual hinge straps and attached handle, cooling shelves and vessels supported.',
'Celadon clinic; smooth barrel canopy, recessed opening and grounded access stairs.',
'Slate quarry cutter; portal feet ride rails, rail bases meet the plinth and blade/carriage form a complete mechanism.',
'Plum cyclone; four support columns now tie into chamber with crossmembers and brackets.',
'Heather vent stack; supported balcony, access ladder has explicit platform mounting brackets.',
'Verdigris irrigator; braced wheeled towers, long truss and suspended sprinkler nozzles.']
r={'pass':'Phase 1 creation review','models':25,
 'glb_sha256':hashlib.sha256((root/'godot/art/art200-wasteland.glb').read_bytes()).hexdigest(),
 'render_engine':'Blender Cycles, 24 samples, native PBR materials',
 'review_method':'Manual inspection of five full-size contact sheets and component connection checks against builder coordinates',
 'issues_fixed':['Roof post gaps','Floating parcel sorting base','Stair/platform coplanar faces','Cold-store louvre mounting','Dress-form foot gap','Air-receiver feet','Bridge stair alignment','Kiln hinge and handle support','Cyclone chamber support ties','Ladder platform brackets','Structural bevel separated from fine lettering','Arc surface smooth normals','Shop-name visibility','Saw rail-to-foundation contact','Trommel hopper feet','Pharmacy clerestory props','Independent workshop roof support'],
 'models_reviewed':[{'id':e['id'],'render':f'renders/{i+1:02}-{e["id"]}.png','review':notes[i]} for i,e in enumerate(d['models'])]}
(p/'visual-review.json').write_text(json.dumps(r,indent=2)+'\n')

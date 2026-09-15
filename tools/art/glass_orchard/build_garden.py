"""Original deployable Seed Garden, with named growth stage groups."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import common as c

r=c.empty('SeedGarden');c.bed((0,0,0),(1.65,1.65),r,False)
for x in [-.72,.72]:
    for z in [-.72,.72]:c.tube('Garden foot',(x,0,z),(x,.32,z),.065,c.steel,r)
    c.tube('Garden end rim',(x,.78,-.8),(x,.78,.8),.032,c.brass,r)
c.tube('Water reservoir',(.6,.24,.91),(.6,.66,.91),.17,c.ivory,r,32)
c.tube('Water gauge',(.59,.31,.735),(.59,.6,.735),.025,c.cyan,r,12)
c.box('Seed garden plaque',(0,.40,-.855),(1.2,.26,.025),c.steel,r,.01)
c.label('Garden identity','HUMAN SEED BANK',(0,.37,-.874),.12,r)
sprouts=c.empty('Growing',parent=r);ready=c.empty('Ready',parent=r)
for i,x in enumerate([-.48,0,.48]):
    for j,z in enumerate([-.48,0,.48]):
        c.plant((x,.69,z),.35,sprouts,i*.4+j*.7)
        c.plant((x,.69,z),.85,ready,i*.4+j*.7)
c.empty('Interact',(0,1.0,0),r)
c.export('seed-garden',r,[sprouts,ready])

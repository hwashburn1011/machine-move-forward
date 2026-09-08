"""Original salvage chest and forged hook. Run in Blender factory-startup."""
import sys, math
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import hardsurface as h
import characters as c
import bpy

def materials():
    maps = c.surface_maps('metal', 512)
    return {name:c.material('Salvage_'+name,color,maps,metal,.7) for name,color,metal in
            [('Paint','aa7840',.45),('Steel','798888',.8),('Dark','263332',.6)]}

def chest():
    M=materials(); root=h.empty('MMF_SalvageChest')
    h.box('Formed steel body',(0,-.04,0),(1.5,1.02,1.1),M['Paint'],root,.065)
    h.box('Lid gasket',(0,.33,0),(1.54,.06,1.14),M['Dark'],root,.026)
    h.box('Pressed lid',(0,.44,0),(1.54,.18,1.14),M['Paint'],root,.055)
    for x in [-.64,.64]:
        h.box('Reinforcing band',(x,0,0),(.075,1.10,1.15),M['Steel'],root,.02)
        for z in [-.56,.56]:
            for y in [-.40,.41]: h.cyl('Recessed bolt',(x,y,z),(x,y,z+(.008 if z>0 else -.008)),.025,M['Dark'],root,16)
    for x in [-.49,.49]:
        h.box('Latch keeper',(x,.22,-.579),(.12,.22,.035),M['Dark'],root,.016)
        h.box('Toggle clasp',(x,.28,-.601),(.07,.16,.027),M['Steel'],root,.016)
        h.cyl('Lid hinge',(x-.09,.33,.57),(x+.09,.33,.57),.045,M['Steel'],root,24)
    for side in [-1,1]:
        h.curve('Drop handle',[(side*.76,.13,-.22),(side*.80,-.02,-.18),(side*.80,-.02,.18),(side*.76,.13,.22)],.022,M['Steel'],root)
    accent=c.material('Salvage_Amber','e9a647',None,.2,.48,.45)
    h.box('Salvage recognition strip',(0,-.10,-.56),(1.32,.095,.018),accent,root,.005)
    h.box('Identification recess',(0,.16,-.562),(.5,.2,.018),M['Dark'],root,.012)
    h.text_label('Cargo marking','RECOVER',(0,.13,-.578),.075,M['Steel'],root)
    h.join_static();h.uv_all();return root

def hook():
    M=materials();root=h.empty('MMF_ForgedHook')
    h.cyl('Forged shank',(0,0,-.26),(0,0,.22),.031,M['Steel'],root,32)
    h.cyl('Crown collar',(0,0,-.14),(0,0,-.08),.047,M['Dark'],root,32)
    h.torus('Swivel eye',(0,0,.255),.046,.011,M['Steel'],root,'z',40,10)
    for i in range(3):
        a=i*math.tau/3
        points=[(math.sin(a)*r,math.cos(a)*r,z) for r,z in [(0,-.12),(.09,-.13),(.17,-.06),(.205,.035),(.19,.08)]]
        h.curve('Forged curved fluke',points,.016,M['Steel'],root)
        h.cyl('Fluke point',points[-1],(math.sin(a)*.172,math.cos(a)*.172,.103),.010,M['Steel'],root,16)
    h.join_static();h.uv_all();return root

if __name__=='__main__':
    for name,fn in [('salvage-chest',chest),('forged-hook',hook)]:
        print(h.save_asset(name,fn))

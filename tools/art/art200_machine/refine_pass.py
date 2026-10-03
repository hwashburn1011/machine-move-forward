"""First full-collection refinement: deliberate small details on every assembly.

Executed in the builder namespace so all details enter the editable master,
palette batches, collision metadata and ordinary reproducible export.
"""
for r in roots:
    current=r;id=r.name.removeprefix('nomad2-');note=''
    if id=='card-table':
        for x in [-.38,.38]:
            tube('Folding table retained hinge',(x-.045,.69,.31),(x+.045,.69,.31),.027,alloy,16)
        note='Connected folding hinge pins; cards seated on baize.'
    elif id=='instrument-bench':
        for x in [-.465,-.155]:box('Inset screen bezel side',(x,1.17,.21),(.014,.235,.009),alloy,.003)
        for y in [1.06,1.28]:box('Inset screen bezel edge',(-.31,y,.21),(.31,.014,.009),alloy,.003)
        note='Thin retained instrument bezel and legibility review.'
    elif id=='privacy-screen':
        for y in [.23,1.59]:box('Canvas horizontal binding stitch',(0,y,-.034),(.69,.005,.003),ivory,.0005)
        note='Bound canvas hems within the supported frame.'
    elif id=='book-cabinet':
        for y in [.58,1.0]:
            for x in [-.44,.44]:tube('Library retaining-rail stanchion',(x,y+.012,.394),(x,y+.26,.394),.009,alloy,12)
            tube('Library retaining rail',(-.44,y+.25,.401),(.44,y+.25,.401),.010,alloy,12)
        note='Book retention rails joined to the actual shelf lips.'
    elif id=='ration-pantry':
        for row in range(3):
            for i,x in enumerate([-.28,0,.28]):label('T%02d'%(row*3+i+1),(x,.345+row*.44,.133),.032,steel)
        note='Individually indexed stock labels on the nine retained cans.'
    elif id=='folding-lounge':
        for x in [-.30,.30]:
            beam('Recliner stitched back binding',(x,.502,-.267),(x,1.102,-.764),.004,ivory)
            box('Recliner stitched seat binding',(x,.475,.26),(.004,.003,1.09),ivory,.0005)
        note='Bound seat/back seams follow the real inclined canvas.'
    elif id=='microscope-bench':
        for x in [-.33,-.13]:box('Spring specimen slide clip',(x,1.173,.10),(.025,.012,.12),alloy,.003)
        note='Supported focus spindle and spring slide clamps.'
    elif id=='paint-trolley':
        for x in [-.25,.20]:
            for dx in [-.025,.025]:box('Crimped brush ferrule',(x+dx,1.239,.18),(.031,.032,.020),alloy,.003)
        note='Brush ferrules join each wooden handle to its bristles.'
    elif id=='air-return-duct':
        for x in [-.24,.24]:box('Duct standing seam',(x,.68,.158),(.012,.88,.013),alloy,.002)
        note='Folded seam strips meet the duct body face.'
    elif id=='sewing-station':
        tube('Sewing tension adjuster',(-.18,1.245,.100),(-.18,1.245,.135),.033,alloy,20)
        note='Seated tension control and complete lower drive pulley reviewed.'
    elif id=='record-console':
        box('Tonearm parked rest',(.08,.82,.15),(.023,.11,.035),steel,.005)
        note='Tonearm cartridge has a physical parked support.'
    elif id=='typewriter-desk':
        for row,text in enumerate(['QWERTYUIO','ASDFGHJKL','ZXCVBNM,.']):
            for column,char in enumerate(text):label(char,((column-4)*.054,.9555-row*.008,.08+row*.066),.022,ivory,True)
        note='All key legends, grounded carriage riser and real spacebar linkage.'
    elif id=='clock-rack':
        for x,y,name in [(-.31,1.57,'DUSK'),(.31,1.57,'WEST'),(0,1.99,'HOME')]:label(name,(x,y-.10,.078),.038,steel)
        note='Three readable route identities printed on the dial faces.'
    elif id=='tile-mural':
        for x in [-.57,.57]:
            for y in [.76,1.64]:bolt((x,y,.052),.010)
        note='Captive frame fasteners and ceramic grout spacing reviewed.'
    elif id=='observation-seat':
        for x in [-.15,.15]:ring('Optical cradle barrel collar',(x,1.40,.26),.098,.009,alloy,'z')
        note='Barrel collars retain the optics on their connected trunnion.'
    elif id=='chess-pedestal':
        for x in [-.447,.447]:
            for z in [-.447,.447]:bolt((x,.846,z),.010,True)
        note='Board corner retainers and distinct complete chess-piece silhouettes.'
    elif id=='exercise-rack':
        for y,z,text in [(.31,.15,'04 / LOAD'),(.66,.025,'08 / LOAD'),(1.01,-.10,'12 / LOAD')]:label(text,(0,y,z+.111),.028,ivory)
        note='Weight index graphics sit on the actual shelf front faces.'
    elif id=='boot-care-stand':
        label('08',(-.17,.986,-.035),.037,steel,True)
        note='Sized wooden last and seated brush with dense bristle rows.'
    elif id=='botanical-belljar':
        ring('Specimen bell seating gasket',(0,1.055,0),.291,.006,alloy)
        note='Bell rim seated in a metal gasket on the supported pedestal.'
    elif id=='map-roll-rack':
        for y,text in [(.28,'01 / WEST'),(.67,'02 / EAST'),(1.06,'03 / NORTH'),(1.45,'04 / HOME')]:label(text,(0,y,.252),.030,ivory)
        note='Shelf route indices and readable capped chart numbers.'
    elif id=='shade-awning':
        tube('Awning rib collector hub',(0,2.02,0),(0,2.08,0),.074,alloy,24)
        note='All four canopy struts terminate in a proper mast hub.'
    elif id=='bagatelle-table':
        for x,z,score in [(-.13,-.03,'20'),(.14,-.03,'20'),(-.23,.24,'05'),(0,.24,'10'),(.23,.24,'05')]:label(score,(x,.841,z),.029,steel,True)
        note='Scoring graphics are flush to the playfield; retained pins reviewed.'
    elif id=='laundry-drum':
        for x in [-.18,.18]:
            box('Wash lid hinge leaf',(x,1.053,-.326),(.10,.023,.105),alloy,.005)
            tube('Wash lid retained hinge pin',(x-.06,1.067,-.365),(x+.06,1.067,-.365),.018,alloy,16)
        note='Rear lid hinge leaves and pins join the drum cap.'
    elif id=='rotary-fan':
        for side in [-1,1]:tube('Fan yoke pivot retainer',(side*.31,1.37,0),(side*.375,1.37,0),.035,alloy,20)
        note='Guard and yoke are tied by physical pivot retainers.'
    elif id=='arrival-bell':
        for side in [-1,1]:
            points=[(side*.28,1.82),(side*.28,1.59),(side*.10,1.82)]
            verts=[xyz((x,y,z)) for z in [-.019,-.007] for x,y in points]
            faces=[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)]
            mesh=bpy.data.meshes.new('Bell lintel gusset');mesh.from_pydata(verts,[],faces);mesh.update()
            obj=bpy.data.objects.new('Bell lintel gusset',mesh);bpy.context.collection.objects.link(obj);finish(obj,obj.name,alloy,.001)
        note='Gussets tie the bell lintel into both load-bearing posts.'
    assert note,id
    manifest[r.name]['phase2_review']=note
    r['phase2_review']=note

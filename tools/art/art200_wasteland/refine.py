"""Phase 2: individually placed fittings and construction detail on all 25 sites."""
FINE_COMB={
'thimble-laundrette':'Four wall clamps and three washer feeds attach the wash manifold to the building and machinery.',
'lattice-truss-bridge':'Five transverse steel ties connect the deck into both side trusses.',
'rail-water-crane':'Valve spindle extends into the wheel hub, closing its32.5mm separation.',
'ballast-loader':'Two crossheads connect the hopper lips to all four load-bearing columns.'}
def touchup(m):
    k=m.name.removeprefix('art200-');m.role('Phase 2 / construction and service fittings')
    if k=='brasswell-teller-bank':
        for x in [-1.25,1.25]:m.box((x,3.10,1.205),(.065,.22,.20),0)
        m.cable([(-2.40,3.04,-1.90),(-2.40,.52,-1.90),(-2.75,.43,-1.90)],.052,0)
        for y in [.68,2.62]:m.box((-2.37,y,-1.86),(.17,.065,.17),4)
        m.box((3.80,.35,0),(.70,.075,.72),0)
        note='Roof downpipe has two wall straps and a grounded outlet; pneumatic cabinet has a base flange.'
    elif k=='dustmile-motel-office':
        m.cable([(0,2.81,-2.05),(0,.50,-2.05),(.35,.43,-2.05)],.053,0)
        for y in [.65,2.45]:m.box((0,y,-1.99),(.15,.065,.22),4)
        for x in [-2.8,2.8]:m.box((x,.43,1.60),(.28,.065,.28),0)
        note='Butterfly roof valley drain and wall straps; porch-post shoes.'
    elif k=='parcel-post-depot':
        for x in [-1.25,.25,1.75,3.15]:
            m.box((x,.55,2.36),(.20,.56,.13),0)
            m.box((x,.66,2.432),(.072,.19,.018),4)
        note='Loading dock rubber bumpers and small muted reflector inserts are mounted to the platform face.'
    elif k=='thimble-laundrette':
        for x in [-2.6,2.65]:
            for y in [.60,1.95]:m.tube((x,y,-1.59),(x,y,-1.34),.048,4,12)
        for x in [-1.85,0,1.85]:m.tube((x,2.15,-1.35),(x,1.43,-1.08),.035,0,12)
        for x in [-1.8,1.8]:m.box((x,2.8,1.55),(.07,.22,.17),0)
        for x in [-1.85,0,1.85]:
            m.tube((x+.41,.72,.13),(x+.41,1.08,.13),.035,4,12)
            for y in [.75,1.04]:m.tube((x+.41,y,.055),(x+.41,y,.13),.030,4,10)
        note='Washer handles have explicit standoff mounts into the metal drum rims.'
    elif k=='emberside-bakery':
        m.box((-1.45,1.25,1.02),(1.65,.075,.55),4)
        for x in [-2.4,-.5]:m.box((x,.91,1.13),(.09,.45,.08),0)
        m.box((-1.45,.88,1.16),(1.88,.48,.09),m.p)
        note='Oven receives an ash-cleanout hatch and a projecting supported metal hearth ledge.'
    elif k=='drylight-pharmacy':
        for x in [-1.35,1.35]:m.box((x,2.69,1.86),(.065,.25,.16),0)
        for x in [-.9,.9]:
            m.box((x,1.61,1.20),(.12,.27,.14),0)
            m.beam((x,1.52,1.17),(x,1.76,1.52),.07,.07,0)
        m.box((0,1.80,1.64),(2.38,.055,.038),4)
        note='Dispensing counter has two angle brackets and a rolled front edge.'
    elif k=='cinder-auto-lift':
        for x in [-1.45,1.45]:
            m.box((x,2.22,.239),(.12,2.0,.022),0)
            for y in [1.3,1.8,2.3,2.8]:m.box((x,y,.258),(.18,.045,.035),4)
        note='Lift columns receive visible safety-lock racks rather than unsupported plain carriers.'
    elif k=='rook-ticket-booth':
        m.box((-.9,1.23,.501),(.37,.072,.028),0)
        for z in [-1.25,1.25]:m.box((2.1,.31,z),(.24,.065,.24),0)
        note='Ticket aperture and queue-rail anchor shoes provide human-scale operational cues.'
    elif k=='switchback-weighbridge':
        for x in [-4.65,4.65]:
            for z in [-1.53,1.53]:m.box((x,.12,z),(.52,.24,.30),m.p)
        m.cable([(-2.8,.40,-2.33),(-2.8,.11,-2.12),(-2.8,.11,-1.68)],.043,0)
        note='Load-cell housings and a grounded scale-to-hut cable complete the measuring mechanism.'
    elif k=='lastcall-exchange':
        for x in [-1.5,1.5]:m.box((x,.47,.49),(.10,.44,.16),0)
        for x in [-1.5,0,1.5]:
            m.box((x,1.0,-.18),(.73,.09,.43),4)
            for dx in [-.22,.22]:m.box((x+dx,.93,-.24),(.075,.16,.13),0)
        note='Each phone alcove has a writing shelf with physical mounting brackets.'
    elif k=='ochre-icehouse':
        for x in [-1.5,1.5]:m.box((x,2.80,1.64),(.07,.19,.18),0)
        for y in [.75,2.12]:
            m.tube((-1.64,y-.12,1.76),(-1.64,y+.12,1.76),.048,4,12)
        m.box((.09,1.39,1.75),(.10,.67,.10),0)
        note='Cold-store strap hinges gain pivot barrels and the handle gains a keeper plate.'
    elif k=='threadbare-tailor':
        m.cable([(-.54,1.60,.35),(-.46,.64,.35),(-1.10,.64,.35),(-1.17,1.52,.35),(-.54,1.60,.35)],.018,0)
        m.box((-.80,.63,.16),(.66,.055,.31),4)
        note='The treadle pedal drives a continuous mounted belt loop to the sewing head.'
    elif k=='crosswind-compressor-house':
        m.tube((1.65,2.43,-.60),(1.65,2.77,-.60),.045,4,12)
        m.tube((1.65,2.74,-.64),(1.65,2.74,-.51),.15,0,24)
        m.tube((1.65,2.74,-.51),(1.65,2.74,-.50),.115,4,24)
        m.beam((1.65,2.74,-.49),(1.71,2.81,-.49),.018,.018,0)
        note='Receiver pressure gauge has a connected stem, bezel and physical needle.'
    elif k=='sinter-grain-elevator':
        for x in [-1.8,1.8]:
            m.tube((x,.74,0),(x,1.03,0),.29,0,24)
            m.box((x,.86,.27),(.68,.11,.11),4)
        note='Both grain funnels have outlet collars and gate actuator crossbars.'
    elif k=='borewell-pumpjack':
        for z in [-.76,.76]:
            m.tube((2.38,2.82,0),(2.38,2.82,z),.09,4,16)
            m.tube((1.80,1.10,0),(1.80,1.10,z),.12,4,16)
        note='Crank links connect through actual cross-shafts to the walking beam and gearbox.'
    elif k=='lattice-truss-bridge':
        for x in [-4.7,-2.4,0,2.4,4.7]:m.box((x,1.075,0),(.14,.14,2.72),0)
        for x in [-4.7,4.7]:
            for z in [-1.20,1.20]:m.box((x,.91,z),(.63,.08,.40),4)
        note='Truss reactions sit on four steel bearing plates over concrete abutments.'
    elif k=='reclaimer-trommel':
        for x in [-1.65,1.65]:
            for z in [-.65,.65]:
                m.tube((x-.15,.78,z),(x+.15,.78,z),.22,0,20)
                m.beam((x,.78,z),(x,1.05+(x+2.35)/4.7*.5,.9 if z>0 else -.9),.11,.11,0)
        note='Drive bands rest on four cradle rollers instead of appearing suspended inside the frame.'
    elif k=='rail-water-crane':
        m.tube((-.9,.9,.70),(-.9,.9,.81),.075,4,16)
        for y in [.48,3.30]:m.bolts((-.9,y+.055,0),.405,6,radius=.023)
        m.box((-.9,.36,0),(.96,.09,.96),0)
        note='Column base gets an anchor shoe and flanges receive six fasteners each.'
    elif k=='ballast-loader':
        for z in [-1.15,1.15]:m.box((0,3.87,z),(3.75,.20,.28),0)
        m.box((0,2.04,.46),(.84,.14,.22),0)
        m.beam((.9,2.4,.52),(.42,2.05,.52),.052,.052,4)
        note='Discharge gate has a crosshead and an attached operating link.'
    elif k=='ceramic-kiln':
        m.box((-.90,.86,.755),(.59,.37,.14),m.p)
        m.box((-.90,.88,.845),(.28,.045,.07),4)
        for x in [-1.7,-.1]:m.box((x,.37,-.4),(.36,.14,1.2),0)
        note='Kiln has a cleanout hatch, mounted pull and broad thermal support shoes.'
    elif k=='desert-ambulatory':
        for x in [-1.34,1.34]:m.box((x,2.40,1.38),(.09,.60,.30),0)
        for x in [-1.07,1.07]:
            m.tube((x,.52,1.52),(x,1.52,1.52),.036,4,16)
            m.box((x,.54,1.52),(.17,.05,.17),0)
        note='Upper handrail ends now terminate in porch anchor posts, completing the access railing.'
    elif k=='demolition-cutter':
        m.tube((.75,1.80,-1.02),(.75,1.80,.40),.12,0,20)
        m.cable([(.75,2.50,-1.10),(.75,2.87,-1.10),(.75,2.87,-1.45)],.043,0)
        note='Saw blade receives a through spindle into the motor and a secured supply loop.'
    elif k=='sandglass-cyclone':
        for x in [-1.28,1.28]:
            for z in [-1,1]:m.box((x,.355,z),(.31,.07,.31),0)
        for y in [1.36,3.35]:m.ring((1.70,y,.87),.32,.265,.075,4,24)
        note='Support posts have footplates; side duct receives service flange collars.'
    elif k=='ventstack-catwalk':
        for x in [-.42,.42]:
            m.tube((x,1.0,2.50),(x,1.0,2.30),.03,0,12)
            m.tube((x,3.7,2.50),(x,3.7,2.30),.03,0,12)
        m.ring((0,.47,0),.80,.63,.10,4,36);m.bolts((0,.53,0),.72,8,radius=.028)
        note='Ladder cage strips connect to the hoops, and stack base flange is explicitly anchored.'
    else:
        for x in [-4.1,4.1]:
            m.tube((x,.61,-1.10),(x,.61,1.10),.12,4,20)
            m.box((x,.75,0),(.46,.35,.52),m.p)
        note='Irrigator wheel towers have complete cross-axles and central gear housings.'
    return note

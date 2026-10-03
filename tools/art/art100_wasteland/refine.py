"""Phase 2: precise additions for the existing 25 wasteland identities."""
FAMILIES={'diner':'oxblood','greenhouse':'celadon','observatory':'denim','passenger-coach':'rose','service-station':'petrol',
'cooling-tower':'stone','excavator':'ochre','solar-farm':'slate','tunnel':'umber','wind-turbine':'heather','cistern':'verdigris',
'rail-switch':'oxblood','container-shelter':'plum','survey-rover':'denim','signal-gantry':'slate','buried-transformer':'celadon',
'pipeline-valve':'olive','scrap-press':'clay','sensor-mast':'heather','cable-drum':'umber','crawler-wreck':'ochre',
'water-condenser':'verdigris','freight-bogie':'petrol','checkpoint-gate':'rose','relay-vault':'stone'}

def touchup(m):
    k=m.name.removeprefix('wasteland-')
    if k=='diner':
        m.stencil('DINER',(-4.63,5.67,3.234),.21)
        for x in [-4.6,-3.1,-1.55,0,1.55,3.1]:
            m.box((x,1.47,2.72),(.09,.18,.18),0)
        note='Each deep window sill receives a physically attached support bracket.'
    elif k=='greenhouse':
        for x in [4.6,5.1,5.7]:
            m.box((x,.86,2.20),(.25,.12,.25),0)
        m.tube((6.9,1.7,2.2),(6.9,1.86,2.2),.12,4,16)
        m.box((6.9,1.82,2.2),(.41,.035,.075),0)
        note='Irrigation trunk clips and service-tank shutoff handle.'
    elif k=='observatory':
        m.box((5.05,1.14,-1.335),(.08,.37,.10),4)
        note='The observatory service hatch receives a mounted metal pull.'
    elif k=='passenger-coach':
        m.stencil('DUSTLINE',(-3.2,3.17,1.717),.19)
        for x in [-5.7,5.7]:
            for z in [1.82]:
                m.beam((x,.63,z),(x,.38,1.58),.065,.065,0)
        m.box((0,.82,0),(3.20,.28,.90),0)
        for x in [-1.40,1.40]:m.box((x,1.12,0),(.13,.49,.96),0)
        note='Boarding-step braces and a suspended underfloor battery enclosure.'
    elif k=='service-station':
        for x in [-3.7,-1.3,2.8]:
            m.box((x+.34,1.16,-1.02),(.12,.32,.11),0)
            m.box((x,1.29,-.996),(.32,.038,.028),4)
        note='Fuel-nozzle holsters and physical access-cover pull strips.'
    elif k=='excavator':
        for z in [-1.4,1.4]:
            for x in [-1.5,.5]:m.beam((x,1.51,z),(x,1.21,z*.65),.07,.07,0)
        note='Operator catwalk now carries visible angle braces into the machinery deck.'
    elif k=='wind-turbine':
        m.box((-5.40,1.23,1.02),(.17,.10,.09),4)
        for x in [-2.9,0]:m.box((x,.075,1.30),(.19,.15,.31),0)
        note='Mast hatch latch and grounded power-cable protection shoes.'
    elif k=='cooling-tower':
        m.box((7.8,.48,0),(1.08,.09,1.0),0)
        m.tube((7.8,1.5,.40),(7.8,1.5,.49),.09,4,16)
        note='Pump controller receives a supported base flange and a physical selector.'
    elif k=='tunnel':
        for x in [-5.85,5.85]:
            for z in [-2.8,0,3.4]:m.box((x,.10,z),(.24,.12,.24),0)
        note='Every inspection-rail upright terminates in an explicit anchor shoe.'
    elif k=='solar-farm':
        for x in [-.9,2.45]:m.box((x,.74,-2.65),(.42,.10,.46),0)
        m.box((6,.39,-5.98),(.53,.08,.13),0)
        note='Tracking actuators gain seated support plates and controller-cable strain relief.'
    elif k=='cistern':
        for y in [.65,2.1,3.45]:
            for x in [-.27,.27]:m.tube((x,y,1.53),(x,y,1.73),.036,0,12)
        note='Access ladder has three pairs of positive tank standoffs.'
    elif k=='rail-switch':
        m.tube((-1,.63,1.80),(-1,.63,2.20),.095,4,16)
        m.box((-1,.70,2.22),(.25,.24,.035),1)
        note='Manual throw lever receives a real through-pivot and pointer plate.'
    elif k=='container-shelter':
        for x in [-1.31,1.98]:m.box((x,1.58,1.49),(.085,2.42,.10),0)
        m.box((.32,2.76,1.51),(3.33,.10,.14),0)
        note='The cut-open side portal receives continuous rolled steel jamb and lintel trims.'
    elif k=='survey-rover':
        for z in [-.62,.62]:m.tube((-1.59,.71,z),(-1.87,.71,z),.075,0,12)
        m.tube((-1.87,.71,-.74),(-1.87,.71,.74),.085,4,16)
        note='Rear survey equipment has a chassis-mounted tubular impact bar.'
    elif k=='signal-gantry':
        for x in [-2.5,0,2.5]:m.box((x,5.55,.45),(.83,.085,.39),0)
        note='Pendant signals gain distinct weather hoods over their lens faces.'
    elif k=='buried-transformer':
        for x in [-.35,.35]:m.beam((x,1.16,.74),(x,1.16,1.10),.085,.085,0)
        note='Previously forward-set service plate now mounts to the tank through two rigid brackets.'
    elif k=='pipeline-valve':
        m.ring((0,1.84,0),.38,.28,.08,4,24)
        for x in [-.25,.25]:m.tube((x,1.85,0),(x,1.95,0),.028,0,6)
        note='Valve bonnet receives a service flange and opposed fastener studs.'
    elif k=='scrap-press':
        for x in [-1.55,1.55]:
            for z in [-.94,.94]:m.box((x,2.1,z),(.36,.24,.36),0)
        note='Four guide-column bearing collars align with the compression platen.'
    elif k=='sensor-mast':
        m.ring((0,3.45,0),.19,.13,.085,0,24)
        m.box((0,1.26,.25),(.55,.075,.45),0)
        note='Guy lines terminate at a mast collar; field-controller hood protects the enclosure seam.'
    elif k=='cable-drum':
        for x in [-1.65,1.65]:
            m.beam((x,2.7,-.78),(x,3.05,-.35),.10,.10,0)
            m.beam((x,2.7,.78),(x,3.05,.35),.10,.10,0)
        note='Lifting portal corner knee braces complete the structural load path.'
    elif k=='crawler-wreck':
        for z in [-.7,.7]:
            m.tube((-1.82,1.27,z),(-2.04,1.27,z),.07,0,12)
        m.tube((-2.04,1.27,-.78),(-2.04,1.27,.78),.08,4,16)
        note='Carrier wreck gains a mounted rear tow crossbar.'
    elif k=='water-condenser':
        m.tube((-1.35,.85,.86),(1.35,.85,.86),.05,0,16)
        for x in [-.9,0,.9]:
            m.cable([(x,.65,.2),(x,.85,.4),(x,.85,.86)],.040,0)
        note='All receiver bottles now share an attached condenser drain manifold.'
    elif k=='freight-bogie':
        for z in [-.84,.84]:
            for x in [-.43,.43]:m.box((x,1.02,z),(.26,.08,.26),0)
        note='Coil packs receive lower spring seats directly above the side frames.'
    elif k=='checkpoint-gate':
        m.stencil('STOP',(-3.8,2.35,.197),.13)
        m.box((3.0,1.89,0),(.37,.13,.40),0)
        m.box((-2.3,1.48,.52),(.19,.09,.08),4)
        note='Barrier rest has a padded saddle and the actuator cover has a service latch.'
    else:
        for y in [.62,1.90]:m.tube((-.84,y-.12,1.78),(-.84,y+.12,1.78),.05,4,12)
        note='Relay-vault hatch gains two heavy hinge barrels aligned with the recessed frame.'
    return FAMILIES[k],note

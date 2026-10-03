"""First collection-wide refinement: old furnishings adopt the shared muted palette."""
families=['petrol','stone','plum','denim','oxblood','slate','olive','verdigris','umber','celadon','denim','ochre','heather','olive','ochre','petrol','rose','verdigris','oxblood','plum','slate','clay','celadon','oxblood','heather']
for root,family in zip(roots,families):
    current=root
    mapping={ochre:colors[family],green:soft[family],cloth:fabrics[family]}
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        for slot in obj.material_slots:
            if slot.material in mapping:slot.material=mapping[slot.material]
    manifest[root.name]['color_family']=family
    manifest[root.name]['phase2_review']='Muted palette, surface finish, bevel economy, support connectivity and graphic placement.'
    root['phase2_review']=manifest[root.name]['phase2_review']
    # A matching maker's fastener at each principal sheet-metal edge, selected
    # from the actual finished geometry; no loose decorative screw cloud.
    panels=[o for o in root.children if o.type=='MESH' and o.data.materials and o.data.materials[0] in [colors[family],soft[family]] and 'rim' not in o.name.lower()]
    bpy.context.view_layer.update()
    for obj in panels:
        corners=[obj.matrix_world@Vector(v) for v in obj.bound_box]
        lo=[min(p[i] for p in corners) for i in range(3)];hi=[max(p[i] for p in corners) for i in range(3)]
        if hi[0]-lo[0]>.45 and hi[2]-lo[2]>.20 and hi[1]-lo[1]<.16:
            x=hi[0]-.040;y=lo[2]+.040;z=-lo[1]+.0005
            box('Handled enamel edge nick',(x,y,z),(.025,.002,.001),alloy,.0002)
            break

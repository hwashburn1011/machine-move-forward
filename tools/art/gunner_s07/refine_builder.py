from pathlib import Path
p=Path('tools/art/gunner_s07/build.py');s=p.read_text()
s=s.replace("rgba[:,:,:3]=np.clip(data,0,1)","rgba[:,:,:3]=np.clip(data,0,1)\n    if color:rgba[:,:,:3]=np.where(rgba[:,:,:3]<.04045,rgba[:,:,:3]/12.92,((rgba[:,:,:3]+.055)/1.055)**2.4)")
s=s.replace(".45*b+.37*c+.18*fine-.57)*12", ".20*b+.48*c+.32*fine-.655)*18")
s=s.replace("wear=np.maximum(wear,(randoms>.996).astype(np.float32)*.9)","wear=np.maximum(wear,(randoms>.9993).astype(np.float32)*.7)")
s=s.replace("scratches=(np.sin(x*math.tau*221+2*b)>.997)*(a>.52)","scratches=(np.sin(x*math.tau*221+2*b)>.999)*(a>.60)")
s=s.replace("rough=.44+.25*n+.12*wear;metal=.72-.38*wear;height=.16*n-.14*wear+.012*randoms", "rough=.43+.22*n+.13*wear;metal=.63-.30*wear;height=.08*n-.19*wear+.004*randoms")
s=s.replace("wear=np.clip((.68*a+.32*b-.42)*5,0,1)","wear=np.clip((.68*a+.32*b-.50)*5,0,1)")
s=s.replace("wear=np.where(c>.67,np.maximum(wear,.8),wear)","wear=np.where((c>.71)&(a>.53),np.maximum(wear,.65),wear)\n        if 'Scarf' in name:wear=np.clip(.20+.40*a+.15*b,0,1)")
s=s.replace("(.105,.101,.09),(.58,.47,.33)","(.16,.151,.131),(.58,.48,.34)")
s=s.replace("(.085,.077,.062),(.38,.315,.224)","(.135,.125,.099),(.37,.31,.225)")
s=s.replace("(.155,.122,.082),(.39,.304,.192)","(.23,.175,.11),(.44,.34,.23)")
s=s.replace("(.022,.026,.024),.05,.79", "(.055,.06,.05),.05,.79")
start=s.index("    boot=box('Reinforced combat boot")
end=s.index("    for j in range(5):\n        y=-.17",start)
s=s[:start]+'''    # Rounded boot last: broad toe, narrow heel, sloped vamp and soft ankle.
    outline=[(-.056,-.257),(.056,-.257),(.084,-.218),(.083,-.139),(.069,.057),(.046,.086),(-.046,.086),(-.069,.057),(-.083,-.139),(-.084,-.218)]
    verts=[];faces=[];nr=len(outline)
    for z,scale,ycompress in [(.045,1,1),(.068,1.01,1),(.11,.96,.98),(.151,.91,.86),(.20,.82,.45),(.245,.74,.30)]:
        for x,y in outline:verts.append((s*.19+x*scale,y*ycompress+.005,z))
    for j in range(5):
        for i in range(nr):k=j*nr+i;n=j*nr+(i+1)%nr;faces.append((k,n,n+nr,k+nr))
    faces.extend([tuple(reversed(range(nr))),tuple(range(5*nr,6*nr))])
    me=bpy.data.meshes.new('Anatomical boot last');me.from_pydata(verts,[],faces);me.update();ob=bpy.data.objects.new('Rounded combat boot '+side,me);current_collection.objects.link(ob)
    finish(ob,ob.name,M['leather'],'foot_'+side,.011)
    verts=[(s*.19+x*1.035,y+.005,z) for z in (.018,.056) for x,y in outline];faces=[tuple(reversed(range(nr))),tuple(range(nr,nr*2))]
    for i in range(nr):faces.append((i,(i+1)%nr,(i+1)%nr+nr,i+nr))
    me=bpy.data.meshes.new('Shaped rubber outsole');me.from_pydata(verts,[],faces);me.update();ob=bpy.data.objects.new('Rounded outsole '+side,me);current_collection.objects.link(ob);finish(ob,ob.name,M['rubber'],'foot_'+side,.006)
    for j in range(6):
        y=-.218+j*.051
        for dx in (-.051,.051):box('Offset sole lug '+side,(s*.19+dx,y,.017),(.052,.026,.019),M['rubber'],'foot_'+side,.006,rotation=(0,0,(-1 if dx<0 else 1)*.25))
    tube('Raised toe welt '+side,[(s*.19-.079,-.19,.09),(s*.19-.052,-.253,.092),(s*.19+.052,-.253,.092),(s*.19+.079,-.19,.09)],.009,M['rubber'],'foot_'+side)
''' + s[end:]
s=s.replace("y=-.17+j*.034;z=.193-abs(j-3)*.003", "y=-.163+j*.033;z=.167+j*.014")
s=s.replace("normal=(s*.55,-.77,.20)","normal=(s*.44,-.88,.15)")
s=s.replace("mark=at+basis@Vector((0,-.024,.046))", "mark=at+basis@Vector((0,-.012,.056))")
s=s.replace("(0,-k*.025,0)),.027 if k==0 else .016", "(0,-k*.027,0)),.031 if k==0 else .018")
s=s.replace("(0,.02,.045)),local", "(0,.028,.055)),local")
s=s.replace("(.57+.42*v)+.75*v**1.55,.145+.18*v+.055*math.sin(u*math.tau*3+v*5)*(.3+v)+.13*v*v,1.69-.61*v", "(.57+.49*v)+.93*v**1.30,-.025+.14*v+.085*math.sin(u*math.tau*3+v*5)*(.3+v)+.13*v*v,1.74-.62*v")
s=s.replace("for x,z in [(-.037,-.015),(.045,-.055)]:", "for x,z in [(-.046,.015),(.044,-.092)]:")
s=s.replace("weapon_root.rotation_euler=Euler((math.radians(10),0,math.radians(35)))", "weapon_root.rotation_euler=Euler((math.radians(20),0,math.radians(35)))")
s=s.replace("weapon_root.location=(-.03,-.28,1.43)", "weapon_root.location=(-.03,-.28,1.375)")
s=s.replace("S=BONES['upperarm_'+side][0];W=Vector(wrist)","S=rig.pose.bones['upperarm_'+side].head.copy();W=Vector(wrist)")
s=s.replace("L1=(BONES['upperarm_'+side][1]-S).length", "L1=(BONES['upperarm_'+side][1]-BONES['upperarm_'+side][0]).length")
needle="arm_pose('r',weapon_root.matrix_world"
pos=s.index(needle)
s=s[:pos]+'''# A wider, flexed-knee stance has a grounded weight-bearing silhouette.
rig.pose.bones['pelvis'].matrix=Matrix.Translation((0,0,-.055))@rig.data.bones['pelvis'].matrix_local
bpy.context.view_layer.update()
for side,sign,y in [('r',-1,-.07),('l',1,.09)]:
    S=rig.pose.bones['thigh_'+side].head.copy();W=Vector((sign*.255,y,.15));L1=rig.data.bones['thigh_'+side].length;L2=rig.data.bones['calf_'+side].length;d=W-S;dist=d.length;direction=d.normalized();a=(L1*L1-L2*L2+dist*dist)/(2*dist);h=math.sqrt(max(0,L1*L1-a*a));pole=Vector((sign*.20,-.55,.51))-S;v=(pole-direction*pole.dot(direction)).normalized();E=S+direction*a+v*h
    orient_bone('thigh_'+side,S,E);orient_bone('calf_'+side,E,W);orient_bone('foot_'+side,W,W+Vector((sign*.025,-.188,-.055)))
''' +s[pos:]
s=s.replace("(-3.05,-5.7,2.9),(.15,-.10,1.08),66", "(-2.65,-5.2,2.30),(.12,-.08,1.08),72")
s=s.replace("scene.render.resolution_percentage=70", "scene.render.resolution_percentage=85")
p.write_text(s)

class_name MMFMeridianBerth
extends Node3D

# Editable procedural scene: all geometry, collision and named interaction
# anchors are rebuilt from durable finale state. No generated binary required.
var game
var points=[]
var lamps=[]
var sprouts=[]
var public_mast: MeshInstance3D
var relay_mast: MeshInstance3D
var lever: MeshInstance3D

func setup(owner_game):
	game=owner_game;name="MeridianReceivingBerth"
	position=Vector3(19,16.03,game.session.distance-game.session.finale.berth_distance)
	var steel=MMFAssets.material(Color(.19,.24,.23));var edge=MMFAssets.material(Color(.55,.41,.22));var dark=MMFAssets.material(Color(.075,.1,.1))
	MMFAssets.box(self,Vector3(12,.36,14),Vector3(0,-.18,0),steel)
	# Raised receiving infrastructure has a visible structural connection to
	# the ground, with braces below the walking deck and no capsule obstacles.
	for x in [-5.2,5.2]:
		for z in [-5.8,5.8]:
			MMFAssets.box(self,Vector3(.6,18,.6),Vector3(x,-9,z),steel)
			MMFAssets.box(self,Vector3(1.1,.3,1.1),Vector3(x,-.6,z),edge,false)
		MMFAssets.box(self,Vector3(.35,.5,12),Vector3(x,-2.7,0),steel,false)
	for z in [-5.8,5.8]:MMFAssets.box(self,Vector3(10.5,.5,.35),Vector3(0,-2.7,z),steel,false)
	for x in [-4,-2,0,2,4]:MMFAssets.box(self,Vector3(.025,.005,13.5),Vector3(x,.006,0),dark,false)
	for z in [-1.1,1.1]:
		for x in range(-6,0):MMFAssets.box(self,Vector3(.35,.007,.1),Vector3(x,.01,z),edge,false)
	MMFAssets.box(self,Vector3(1.2,.16,2.2),Vector3(-6.5,-.08,0),edge)
	for z in [-6.95,6.95]:
		MMFAssets.box(self,Vector3(12,.08,.09),Vector3(0,1.12,z),edge)
		for x in [-5.8,-3,0,3,5.8]:MMFAssets.box(self,Vector3(.075,1.12,.075),Vector3(x,.56,z),steel)
	for z in [-4.1,4.1]:MMFAssets.box(self,Vector3(.1,1.1,5.7),Vector3(-5.95,.55,z),edge)
	MMFAssets.box(self,Vector3(.1,1.1,14),Vector3(5.95,.55,0),edge)
	for x in [-5.5,5.5]:
		for z in [-6.5,6.5]:MMFAssets.box(self,Vector3(.22,4.2,.22),Vector3(x,2.1,z),steel)
	MMFAssets.box(self,Vector3(11.3,.18,3),Vector3(0,4.1,-5.1),steel)
	for x in [-4,-2,0,2,4]:MMFAssets.box(self,Vector3(.06,3.8,.06),Vector3(x,2.05,-6.7),edge)
	var glass=MMFAssets.material(Color(.24,.5,.46,.22));glass.transparency=BaseMaterial3D.TRANSPARENCY_ALPHA
	MMFAssets.box(self,Vector3(10.8,3.5,.04),Vector3(0,2.1,-6.75),glass,false)
	for spec in [["reference","MAINTENANCE REFERENCE",Vector3(-3.7,0,-2)],["receiver","RECEIVING COUPLER",Vector3(-1.5,0,-4)],["seeds","SEED ENCLOSURE",Vector3(1.6,0,-4)],["archive","ARCHIVE RECEIVER",Vector3(3.6,0,-1.5)],["transmitter","ACCESS TRANSMITTER",Vector3(3.6,0,2.5)]]:
		var at=spec[2]
		MMFAssets.box(self,Vector3(1,.9,.65),at+Vector3(0,.45,-.6),steel)
		var panel=MMFAssets.box(self,Vector3(.8,.32,.045),at+Vector3(0,.97,-.35),dark,false);panel.rotation.x=-.25
		lamps.append(MMFAssets.box(self,Vector3(.64,.035,.03),at+Vector3(0,1.15,-.3),edge,false))
		add_point(spec[0],spec[1],at)
	lever=MMFAssets.box(self,Vector3(.055,.4,.06),Vector3(-1.5,1.1,-4.45),edge,false)
	# Seed cups sit on a physical propagation bench, with four grounded legs.
	# The lip stays below the cup rims and the assembly leaves the service aisle open.
	var bench=MMFAssets.box(self,Vector3(2.56,.1,.56),Vector3(.8,.78,-5.15),steel);bench.name="SeedPropagationBench"
	for x in [-.34,1.94]:
		for z in [-5.35,-4.95]:cylinder(Vector3(x,.365,z),.045,.73,steel)
	for z in [-5.42,-4.88]:MMFAssets.box(self,Vector3(2.56,.065,.025),Vector3(.8,.8525,z),edge,false)
	for i in 6:
		var x=-.2+i*.4
		var cup=cylinder(Vector3(x,.95,-5.15),.16,.24,edge);cup.name="SeedCup_"+str(i)
		var leaf=MMFAssets.box(self,Vector3(.23,.24,.025),Vector3(x,1.18,-5.15),MMFAssets.material(Color(.19,.52,.17)),false);leaf.rotation.z=.5 if i%2 else -.5;sprouts.append(leaf)
	for z in [-2.1,-1.1]:
		var reservoir=cylinder(Vector3(4.8,.75,z),.24,1.5,dark);reservoir.name="BerthReservoir_"+str(z)
		for y in [.08,1.42]:cylinder(Vector3(4.8,y,z),.255,.045,edge,false)
		cylinder(Vector3(4.8,1.54,z),.085,.08,steel,false)
	public_mast=cylinder(Vector3(4.8,2.2,4.2),.065,4.4,edge)
	relay_mast=cylinder(Vector3(4.2,2,4.2),.075,4,edge)
	for x in [4.2,4.8]:cylinder(Vector3(x,.08,4.2),.18,.16,steel)
	add_point("return","RETURN GANGWAY / NOMAD",Vector3(-5.5,0,0))
	MMFArt100Story.decorate_berth(self)
	MMFArt200Story.decorate_berth(self)
	MMFSiteGrounding.attach(self,"receiving-berth",game)
	sync()

func cylinder(at: Vector3,radius: float,height: float,material: Material,solid: bool=true) -> MeshInstance3D:
	var node=MeshInstance3D.new();var mesh=CylinderMesh.new();mesh.top_radius=radius;mesh.bottom_radius=radius;mesh.height=height;mesh.radial_segments=24
	node.mesh=mesh;node.material_override=material;node.position=at;add_child(node)
	if solid:
		var body=StaticBody3D.new();node.add_child(body)
		var shape=CollisionShape3D.new();var cylinder_shape=CylinderShape3D.new();cylinder_shape.radius=radius;cylinder_shape.height=height
		shape.shape=cylinder_shape;body.add_child(shape)
	return node

func add_point(id: String,title: String,at: Vector3):
	var label=Label3D.new();label.text=title;label.position=at+Vector3(0,1.7,-.5);label.font_size=24;label.pixel_size=.0035;label.billboard=BaseMaterial3D.BILLBOARD_ENABLED;label.visibility_range_end=7;add_child(label)
	points.append({"id":id,"title":title,"at":at,"label":label})

func nearest() -> Dictionary:
	var best={};var distance=2.3
	for p in points:
		var length=game.player.position.distance_to(to_global(p.at))
		if length<distance:best=p;distance=length
	return best

func reached(id: String) -> bool:
	for p in points:
		if p.id==id:return game.player.position.distance_to(to_global(p.at))<2.5
	return false

func safe_support() -> bool:
	var support=game.player.boundary.support_at(game.player.position)
	return not support.is_empty() and is_ancestor_of(support.collider) and game.player.boundary.fits(game.player.position)

func access_clear() -> bool:
	for x in [11.5,12.0,12.5,13.0,13.5,14.0]:
		if not game.player.boundary.fits(Vector3(x,16.09,0)):return false
	return true

func sync():
	var f=game.session.finale
	for i in lamps.size():lamps[i].material_override=MMFAssets.material(Color(.14,.8,.42) if f.powered else Color(.8,.34,.08),.9)
	for sprout in sprouts:sprout.visible=f.seeds
	lever.rotation.z=-.65 if f.powered else .65
	public_mast.material_override=MMFAssets.material(Color(.15,.8,.7) if f.policy=="open" else Color(.23,.27,.27),1 if f.policy=="open" else 0)
	relay_mast.material_override=MMFAssets.material(Color(.45,.6,1) if f.policy=="relay" else Color(.23,.27,.27),1 if f.policy=="relay" else 0)
	MMFArt100Story.sync_berth(self)

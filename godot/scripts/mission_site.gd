class_name MMFMissionSite
extends RefCounted

var owner
var game
var site: Node3D
var id=""
var contact_id=""
var coupling: Node3D
var lamp: MeshInstance3D
var hooked=false
var last_state=""

func setup(opportunities,root: Node3D):
	owner=opportunities;game=owner.game;site=root;contact_id=game.session.contacts.active.id
	id=MMFMissions.contact_mission(game.session.contacts.active)
	# Existing refuge art supplies a raised deck, rails and a stationary robot.
	site.add_child(MMFAssets.scene("res://art/native-friendly-refuge.glb"))
	solid({"position":Vector3(0,-.23,0),"half":Vector3(6,.23,5)})
	solid({"position":Vector3(-6.5,-.08,0),"half":Vector3(.5,.08,1)})
	for z in [-4.94,4.94]:solid({"position":Vector3(0,.55,z),"half":Vector3(5.95,.55,.045)})
	for z in [-3.05,3.05]:solid({"position":Vector3(-5.94,.55,z),"half":Vector3(.045,.55,1.9)})
	for spec in [[Vector3(2,.45,-2.2),Vector3(.55,.45,1)],[Vector3(3.25,.7,1),Vector3(.5,.7,.4)],[Vector3(-2.5,.9,1.9),Vector3(.45,.9,.3)],[Vector3(-.2,.75,3.5),Vector3(.6,.75,.35)]]:solid({"position":spec[0],"half":spec[1]})
	owner.add_point("contact",MMFNativeNarrativeData.MISSIONS[id].title,Vector3(-2.5,1,1.15))
	owner.add_point("console","Local service control",Vector3(-.2,1,2.8))
	owner.add_point("cache","Mission supply locker",Vector3(3.25,1,1.8))
	owner.add_point("return","Return to the Nomad",Vector3(-5.4,1,0))
	lamp=MMFAssets.box(site,Vector3(.4,.08,.1),Vector3(-.2,1.3,3.4),MMFAssets.material(Color(.8,.25,.05),1),false)
	if id=="stranded-courier":
		coupling=Node3D.new();site.add_child(coupling)
		var mesh=MeshInstance3D.new();var shape=CylinderMesh.new();shape.top_radius=.2;shape.bottom_radius=.2;shape.height=.6;shape.radial_segments=24
		mesh.mesh=shape;mesh.material_override=MMFAssets.material(Color(.82,.52,.12));mesh.rotation.z=PI/2;coupling.add_child(mesh)
		for x in [-.3,.3]:MMFAssets.box(coupling,Vector3(.09,.3,.3),Vector3(x,0,0),MMFAssets.material(Color(.14,.23,.25)),false)
	elif id=="roof-supplies":
		for x in [1.3,2.1,2.9]:
			MMFAssets.box(site,Vector3(.6,.5,.7),Vector3(x,.25,-3.4),MMFAssets.material(Color(.36,.47,.28)))
			MMFAssets.box(site,Vector3(.08,.52,.72),Vector3(x,.25,-3.4),MMFAssets.material(Color(.75,.64,.39)),false)
	elif id=="quiet-watch":
		MMFAssets.box(site,Vector3(.13,4,.13),Vector3(3.9,2,-3.3),MMFAssets.material(Color(.21,.27,.28)))
		for y in [2.5,3.1,3.7]:MMFAssets.box(site,Vector3(1.3,.045,.06),Vector3(3.9,y,-3.3),MMFAssets.material(Color(.71,.31,.14)),false)
	update()

func record() -> Dictionary:return game.session.missions.records[id]

func update():
	var r=record()
	if is_instance_valid(lamp) and last_state!=r.status:lamp.material_override=MMFAssets.material(Color(.15,.75,.38) if r.status=="completed" else Color(.8,.3,.05),1)
	last_state=r.status
	if is_instance_valid(coupling) and not hooked:
		coupling.position=Vector3(-.2,1,3.4) if r.step>0 else Vector3(3,1.1,3)
		coupling.visible=true

func point_visible(point: String) -> bool:
	return point!="cache" or (id=="stranded-courier" and record().status=="completed")

func point_text(point: String) -> String:
	if point=="console":return {"stranded-courier":"Charging cradle · connect recovered coupling","roof-supplies":"Dispatch bus · donate / restart","quiet-watch":"Order uplink · isolate / cut / decoy"}[id]
	if point=="contact":return MMFNativeNarrativeData.MISSIONS[id].title+" · "+record().status.replace("_"," ")
	if point=="cache":return "Supply locker · %d fuel / %d components"%[record().stock.fuel,record().stock.components]
	return "Return to the Nomad" if point=="return" else ""

func reached(point: String) -> bool:
	if game.session.health<=0 or game.cinematic!="" or game.combat.active_threat() or game.session.contacts.active.get("id","")!=contact_id or game.session.contacts.active.get("state","") not in ["docked","visited"]:return false
	for p in owner.points:
		if p.id==point:return point_visible(point) and game.player.position.distance_to(site.to_global(p.at)-Vector3.UP*.7)<2.5
	return false

func authorized() -> bool:
	return game.menu_open and game.ui.page=="Mission" and game.ui.station_kind=="mission" and reached(game.ui.storage_id)

func interact(point: String):
	if not reached(point):return
	if point=="return":game.session.notify("Return across the gangway, then depart at the helm.");return
	game.open_station("Mission","mission",point)

func action(q: Dictionary):
	if not authorized():return
	var point=game.ui.storage_id
	if (q.action=="claim" and point!="cache") or (q.action!="claim" and point!="console"):return
	if MMFMissionContracts.act(game.session,q):
		update();owner.refresh_labels()
		if record().status=="completed":
			game.journey.enqueue("mission/completed/"+id,MMFNativeNarrativeData.MISSIONS[id].speaker,{"stranded-courier":"The cradle is charging again. Take the checksum and the fuel by the locker. I will listen for the receiving berth.","roof-supplies":"Dispatch received. Eight fuel items will be waiting at the Orchard's common return station. Thank you for keeping the next roof supplied.","quiet-watch":"Retransmitter isolated. The Order cannot use this uplink to intercept your final receiving handshake. Other patrols are still active."}[id])
		game.ui.refresh()
	else:game.session.notify("The request changed, or supplies are unavailable. Review the local controls again.");game.ui.refresh()

func render(ui):
	if not authorized():ui.text_line("Return to this mission's local control.");return
	var r=record();ui.section(MMFNativeNarrativeData.MISSIONS[id].title,r.status.to_upper())
	ui.text_line(MMFNativeNarrativeData.MISSIONS[id].description)
	if game.ui.storage_id=="cache":
		ui.text_line("%d fuel items · %d components remain"%[r.stock.fuel,r.stock.components])
		var q=MMFMissionContracts.quote(game.session,id,"claim");ui.button("COLLECT AVAILABLE SUPPLIES",func():action(q));return
	if game.ui.storage_id!="console":
		ui.text_line("Reel the loose yellow coupling with [{key:reel}], then use the charging cradle." if id=="stranded-courier" and r.step==0 else "Operate the marked local service control.");return
	if r.status=="completed":ui.text_line("Work complete. The result is recorded; return aboard whenever ready.");return
	var commands=[]
	match id:
		"stranded-courier":
			if r.step==0:ui.text_line("Aim at the yellow coupling and throw the salvage hook with [{key:reel}]. Close this panel to reel it.")
			else:commands=[["connect","CONNECT COUPLING / RESTART CRADLE"]]
		"roof-supplies":
			if not r.paid:
				ui.text_line("Donation: 2 components + 4 fuel ITEMS. Tank fuel stays aboard.\n"+MMFMissionContracts.supplies_sources(game.session))
				commands=[["donate","CONFIRM DONATION"]]
			else:commands=[["restart","ISOLATE / RESTART DISPATCH BUS"]]
		"quiet-watch":
			commands=[["isolate","ISOLATE UPLINK"]] if r.step==0 else [["cut","CUT ISOLATED UPLINK"]]
			commands.append(["decoy","INSERT SIGNAL DECOY · 1 ITEM"])
	for command in commands:
		var q=MMFMissionContracts.quote(game.session,id,command[0]);ui.button(command[1],func():action(q))

func hook_target() -> Dictionary:
	if id!="stranded-courier" or record().status!="in_progress" or record().step!=0 or not reached_area():return {}
	return {"at":coupling.global_position,"contact":contact_id}

func reached_area() -> bool:
	return game.session.contacts.active.get("id","")==contact_id and game.session.contacts.active.get("state","") in ["docked","visited"] and game.session.health>0

func hook_motion(at: Vector3):
	if not hook_target().is_empty():hooked=true;coupling.global_position=at

func hook_finish():
	if not hook_target().is_empty():
		MMFMissionContracts.act(game.session,MMFMissionContracts.quote(game.session,id,"recover"))
		game.session.notify("Coupling recovered. Connect it at the marked charging cradle.")
	hooked=false;update()

func solid(spec: Dictionary):
	MMFAssets.collider(site,{"position":MMFAssets.dict_v(spec.position),"half":MMFAssets.dict_v(spec.half)})

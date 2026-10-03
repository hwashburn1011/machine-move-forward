class_name MMFSurvivorSite
extends RefCounted

const KINDS=["friendly-refuge","rooftop-workshop"]
const RECORD_REFUGE="R-9 keeps the charger beside a human-sized cot. A water ledger records three names, then two, then one. The newest entry reads: 'No arrivals this week. Keep the light on anyway.'"
const RECORD_WORKSHOP="SHIFT NOTE / MARA + UNIT K-4\n\nMara: The small handles are for my hands. Please stop replacing them with magnetic grips.\nK-4: Accepted. I have made two sets. Your lunch is still in the cold cupboard.\nMara: And your charging lead is repaired. See you after the dust clears."
var opportunities
var game
var site
var upper_gate: StaticBody3D
var upper_door: Node3D
var upper_open=false
var bridge_guide: Node3D
var bridge_layout_key=""
var bridge_supported=false
var workshop_guide
var workshop_lights=[]
var workshop_light_state=""

func setup(owner_opportunities,root: Node3D):
	opportunities=owner_opportunities;game=opportunities.game;site=root
	var kind=game.session.contacts.active.kind
	site.add_child(MMFAssets.scene("res://art/native-friendly-refuge.glb" if kind=="friendly-refuge" else "res://art/native-rooftop-workshop.glb"))
	MMFSiteRoofs.attach(site,kind)
	box(Vector3(0,-.23,0),Vector3(6,.23,5))
	box(Vector3(-6.5,-.08,0),Vector3(.5,.08,1))
	# Explicit walking colliders, open at the primary docking anchor.
	for z in [-4.94,4.94]: box(Vector3(0,.55,z),Vector3(5.95,.55,.045))
	for z in [-3.05,3.05]: box(Vector3(-5.94,.55,z),Vector3(.045,.55,1.9))
	if kind=="friendly-refuge":
		box(Vector3(2,.45,-2.2),Vector3(.55,.45,1))
		box(Vector3(3.25,.7,1),Vector3(.5,.7,.4))
		box(Vector3(-2.5,.9,1.9),Vector3(.45,.9,.3))
		box(Vector3(-.2,.75,3.5),Vector3(.6,.75,.35))
		point("survivor","R-9 · offer one component (3 needed)",Vector3(-2.5,1,1.15))
		point("service","Refuge relay · isolate and repair",Vector3(-.2,1,2.8))
		point("reward","R-9's supply exchange",Vector3(3.25,1,1.8))
		point("evidence","Read the refuge water ledger",Vector3(2,1,-.9))
	else:
		box(Vector3(5.6,1.8,0),Vector3(.175,1.8,4.75))
		box(Vector3(1.8,1.8,-4.7),Vector3(3.8,1.8,.16))
		for x in [-1.4,1.6,4.6]: box(Vector3(x,.53,-3.4),Vector3(1.2,.53,.525))
		box(Vector3(-3.3,.85,-2.5),Vector3(.5,.85,.4))
		box(Vector3(3.8,.9,1.5),Vector3(.35,.9,.4))
		box(Vector3(1,.75,.2),Vector3(.625,.75,.35))
		box(Vector3(0,3.48,6),Vector3(3,.12,2))
		box(Vector3(3,4.7,6),Vector3(.08,1.1,2))
		for z in [4.35,7.65]: box(Vector3(-3,4.7,z),Vector3(.11,1.1,.35))
		box(Vector3(0,4.7,7.95),Vector3(3,1.1,.08))
		box(Vector3(0,5.83,6),Vector3(3.15,.07,2.15))
		box(Vector3(1.6,4.15,6),Vector3(.45,.55,.5))
		for mesh in MMFAssets.of_type(site,"MeshInstance3D"):
			var mat=mesh.get_active_material(0)
			if mat is StandardMaterial3D and "phosphor" in mat.resource_name.to_lower(): workshop_lights.append(mesh)
		upper_gate=box(Vector3(-3,4.7,6),Vector3(.10,1.1,1.3))
		upper_gate.set_meta("workshop_bridge_interlock",true)
		upper_door=MMFAssets.find_named(site,"BridgeInterlockDoor")
		point("isolate","Isolate the workshop bus",Vector3(-3.3,1,-1.75))
		point("fuse","Recover a replacement fuse",Vector3(3.8,1,.65))
		point("service","Restart the workshop bus",Vector3(1,1,-.6))
		point("reward","Recover workshop supplies",Vector3(4.6,1,-2.4))
		point("evidence","Read the shared shift note",Vector3(-1.4,1,-2.4))
		point("upper-cache","Recover raised archive cache",Vector3(1.6,4.6,5.1))
		point("bridge-note","Upper entrance · connect a boarding extension",Vector3(-4.3,1,3))
		point("return","Return gangway · Nomad",Vector3(-5.4,1,0))
		bridge_guide=Node3D.new();site.add_child(bridge_guide)
		var guide_material=MMFAssets.material(Color(.9,.65,.2),1.4)
		for z in [-.98,.98]: MMFAssets.box(bridge_guide,Vector3(1.96,.02,.035),Vector3(-5,3.64,6+z),guide_material,false)
		for x in [-.98,.98]: MMFAssets.box(bridge_guide,Vector3(.035,.02,1.96),Vector3(-5+x,3.64,6),guide_material,false)
		point("bridge-guide","UPPER DOCK · extend a supported deck to this marker",Vector3(-5,4.5,6))
		workshop_guide=load("res://scripts/workshop_guide.gd").new();workshop_guide.setup(self)
	update()

func box(at: Vector3,half: Vector3) -> StaticBody3D:
	return MMFAssets.collider(site,{"position":MMFAssets.dict_v(at),"half":MMFAssets.dict_v(half)})

func point(id: String,label: String,at: Vector3): opportunities.add_point(id,label,at)

func bridge_connected() -> bool:
	var key=str(game.building.layout_revision)
	if bridge_layout_key==key: return bridge_supported
	bridge_layout_key=key;bridge_supported=false
	if not game.building.supported_floor({"x":7,"y":1,"z":3}): return false
	for p in game.session.structures:
		if p.definitionId=="boarding-extension" and p.cell=={"x":7,"y":1,"z":3} and int(p.rotation) in [1,3] and p.health>0: bridge_supported=true;return true
	return false

func update():
	if game.session.contacts.active.get("kind","")!="rooftop-workshop": return
	var connected=bridge_connected()
	upper_open=connected
	if is_instance_valid(upper_gate): upper_gate.collision_layer=0 if connected else 1
	if is_instance_valid(upper_door): upper_door.visible=not connected
	if is_instance_valid(bridge_guide): bridge_guide.visible=not connected
	if workshop_guide: workshop_guide.update()
	var st=game.session.survivor_content.workshop
	var state="powered" if st.powered else ("isolated" if st.isolated else "off")
	if state!=workshop_light_state:
		workshop_light_state=state
		var tint=Color(.12,.70,.26) if st.powered else (Color(.52,.24,.035) if st.isolated else Color(.025,.045,.03))
		for mesh in workshop_lights: mesh.material_override=MMFAssets.material(tint,.85 if st.powered else .12)

func workshop_text(id: String) -> String:
	var st=game.session.survivor_content.workshop
	match id:
		"isolate": return "ISOLATE BUS · start here"
		"fuse": return "FUSE CUPBOARD · recover spare" if st.isolated else "FUSE CUPBOARD · isolate bus first"
		"service": return "RESTART BUS · hold to fit fuse" if service_ready() else "RESTART BUS · isolate and recover fuse first"
		"reward": return "MAIN CACHE · claimed" if empty(st.mainLoot) else ("MAIN CACHE · salvage and bridge materials" if st.powered else "MAIN CACHE · restore power")
		"upper-cache": return "RAISED CACHE · claimed" if empty(st.upperLoot) else "RAISED CACHE · components and repair kit"
		"evidence": return "SHARED SHIFT NOTE · read again" if st.record else "SHARED SHIFT NOTE · humans and machines"
		"bridge-note","bridge-guide": return "SHOW UPPER-DECK BUILD PLAN" if not workshop_guide.active else workshop_guide.summary()
		"return": return "RETURN TO NOMAD · departure remains optional"
	return ""

func point_visible(id: String) -> bool:
	var kind=game.session.contacts.active.kind
	if kind=="friendly-refuge":
		var st=game.session.survivor_content.refuge
		if id=="service": return not st.repaired
		if id=="reward":return not empty(st.reward)
	else:
		var st=game.session.survivor_content.workshop
		if id=="isolate": return not st.isolated
		if id=="fuse": return not st.fuse
		if id=="service": return not st.powered
	return true

func point_text(id: String) -> String:
	if game.session.contacts.active.get("kind","")=="rooftop-workshop":return workshop_text(id)
	if game.session.contacts.active.get("kind","")!="friendly-refuge":return ""
	var st=game.session.survivor_content.refuge
	match id:
		"survivor":return "R-9 · talk" if st.repaired or st.components==3 else "R-9 · give 1 component (%d/3)"%st.components
		"service":return "Repair refuge relay" if st.components==3 else "Relay · needs %d components"%(3-st.components)
		"reward":return "Exchange · %d scrap / %d fuel"%[st.reward.scrap,st.reward.fuel]
	return ""

func service_ready() -> bool:
	if game.session.contacts.active.kind=="friendly-refuge":
		var st=game.session.survivor_content.refuge
		return st.components==3 and not st.repaired
	var st=game.session.survivor_content.workshop
	return st.isolated and st.fuse and not st.powered

func finish_service():
	var s=game.session
	if not service_ready(): return
	if s.contacts.active.kind=="friendly-refuge":
		var st=s.survivor_content.refuge
		st.repaired=true;st.workshopKnown=true;st.ackAt=s.distance+600
		s.notify("Relay repaired. Exchange ready; R-9 has marked a nearby workshop.")
		game.journey.enqueue("survivor/refuge-repaired","R-9","That buys us a few nights. Take the spare metal and fuel. I've marked a workshop ahead—there's equipment upstairs.")
	else:
		s.survivor_content.workshop.powered=true
		s.notify("Workshop power restored. Main salvage cupboard released; the raised cache needs a supported boarding extension.")
	s.contacts.active.step="task-complete"

func transfer(rewards: Dictionary):
	var remaining=0
	for id in rewards:
		rewards[id]=game.session.add_resource(id,int(rewards[id]));remaining+=rewards[id]
	game.session.notify("Supplies transferred." if remaining==0 else "Storage full. Remaining supplies stay in this cache.")
	game.session.changed.emit()

func interact(id: String):
	var s=game.session
	var kind=s.contacts.active.kind
	if kind=="friendly-refuge":
		var st=s.survivor_content.refuge
		match id:
			"survivor":
				if st.repaired:s.notify("R-9: 'You're welcome to rest. That workshop bearing is on your receiver. No obligations.'")
				elif st.components>=3: s.notify("R-9: 'Enough parts. Hold the relay control while I steady the line.'")
				elif s.pay({"components":1}):
					st.components+=1;s.notify("R-9: 'Thank you. %d of 3 components ready. No hurry if you need the rest yourself.'"%st.components)
				else: s.notify("R-9: 'No spare parts? That's all right. Keep yourself moving.'")
			"service": s.notify("Hold [{key:use}] to repair the relay." if service_ready() else "Offer R-9 three components first; the relay has no spares.")
			"reward":
				if st.repaired: transfer(st.reward);s.contacts.active.state="visited" if empty(st.reward) else "docked"
				else: s.notify("R-9: 'A few supplies in exchange for getting the relay running, if that suits you.'")
			"evidence": st.record=true;record("Refuge water ledger",RECORD_REFUGE,"refuge-ledger")
	else:
		var st=s.survivor_content.workshop
		match id:
			"isolate": st.isolated=true;s.notify("Bus isolated. The fuse cupboard can now be opened safely.")
			"fuse":
				if st.isolated: st.fuse=true;s.notify("Replacement fuse recovered. Return to the restart console.")
				else: s.notify("Live bus: isolate it at the west cabinet first.")
			"service": s.notify("Hold [{key:use}] to install the fuse and restart." if service_ready() else "Isolate the bus, then recover the replacement fuse.")
			"reward":
				if st.powered: transfer(st.mainLoot)
				else: s.notify("The salvage cupboard is latched. Restore the workshop bus.")
			"upper-cache":
				if st.powered and bridge_connected(): transfer(st.upperLoot)
				else: s.notify("Restore power and connect a supported boarding extension at the upper entrance.")
			"evidence": st.record=true;record("A shared shift",RECORD_WORKSHOP,"shared-shift")
			"bridge-note","bridge-guide": workshop_guide.show()
			"return": s.notify("The primary gangway at the west edge stays open. The Nomad waits until you return aboard and choose departure at the helm.")
		if st.powered and empty(st.mainLoot) and empty(st.upperLoot): s.contacts.active.state="visited"

func record(title: String,message: String,id: String):
	var s=game.session
	var key="survivor/"+id
	if key not in s.polish.seen:
		s.polish.seen.append(key);s.polish.log.append({"speaker":title,"text":message})
		if s.polish.log.size()>64: s.polish.log.pop_front()
	game.ui.show_record(title,message)

func empty(rewards: Dictionary) -> bool:
	for count in rewards.values():
		if count>0: return false
	return true

static func acknowledge(game):
	var st=game.session.survivor_content.refuge
	if not st.repaired or st.acknowledged or st.ackAt<0 or game.session.distance<st.ackAt: return
	var id="survivor/refuge-later"
	if id in game.session.polish.seen: st.acknowledged=true;return
	if game.combat.active_threat() or game.cinematic!="" or not game.aboard() or game.session.health<=0:return
	if game.session.contacts.active.get("kind","")=="friendly-refuge":return
	game.journey.enqueue(id,"R-9 / WEAK SIGNAL","Relay's holding. A traveler saw our light. They're resting now. Your spare parts bought someone a safe night. Safe miles.")

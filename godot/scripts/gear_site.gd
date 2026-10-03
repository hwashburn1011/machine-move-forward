class_name MMFGearSite
extends RefCounted

var owner_site
var game
var root: Node3D
var module_id=""
var device: Node3D
var device_bodies: Array[StaticBody3D]=[]

func setup(owner,site: Node3D):
	owner_site=owner;game=owner.game;root=site
	module_id=game.session.contacts.active.kind.trim_prefix("gear-")
	root.add_child(MMFNativeProgression.model("recovery-platform"))
	for spec in [
		{"position":{"y":-.12},"half":{"x":6,"y":.12,"z":4}},
		{"position":{"x":-6.5,"y":-.08},"half":{"x":.5,"y":.08,"z":1}},
		{"position":{"x":0,"y":1,"z":-3.9},"half":{"x":6,"y":.07,"z":.07}},
		{"position":{"x":0,"y":1,"z":3.9},"half":{"x":6,"y":.07,"z":.07}},
		{"position":{"x":5.9,"y":1},"half":{"x":.07,"y":.07,"z":4}},
		{"position":{"x":-1.8,"y":.6,"z":-2},"half":{"x":.6,"y":.6,"z":.45}},
		{"position":{"x":.2,"y":.5,"z":2},"half":{"x":.3,"y":.5,"z":.25}}
	]:MMFAssets.collider(root,spec)
	# The open docking entrance is 2.6 m wide. Its flanking rails and the local
	# release cabinet are solid just like their visible authored counterparts.
	for z in [-2.6,2.6]:MMFAssets.collider(root,{"position":{"x":-5.9,"y":1,"z":z},"half":{"x":.07,"y":.07,"z":1.3}})
	for x in [2.0,3.0]:MMFAssets.collider(root,{"position":{"x":x,"y":.12,"z":-1.6},"half":{"x":.065,"y":.12,"z":.75}})
	# The two permanent cradle feet support the recoverable assembly 24 cm
	# above the deck. Its collision belongs to the removable device, not the site.
	device=MMFNativeProgression.model(module_id);device.position=Vector3(2.5,.24,-1.6);root.add_child(device)
	MMFNativeProgression.configure_model(device,{"definitionId":module_id})
	for spec in game.runtime.pieceColliders[module_id]:
		device_bodies.append(MMFAssets.collider(device,{"position":spec.offset,"half":spec.half}))
	owner_site.add_point("gear-isolate","Isolate the recovery feed",Vector3(-2.0,1,-1.1))
	owner_site.add_point("gear-release","Release the retaining locks",Vector3(.2,1,1.4))
	owner_site.add_point("gear-recover","Recover "+MMFNativeProgression.MODULES[module_id].name,Vector3(2.5,1,-.65))
	owner_site.add_point("gear-record","Read service notes",Vector3(-3.4,1,1.5))
	state()
	update()

func state() -> Dictionary:
	var sites=game.session.expedition_gear.sites
	if not sites.has(module_id):sites[module_id]={"step":0,"record":false,"trialSpawned":false}
	return sites[module_id]

func point_visible(id: String) -> bool:
	if module_id in game.session.expedition_gear.recovered:return id=="gear-record"
	return id=="gear-record" or id==["gear-isolate","gear-release","gear-recover"][int(state().step)]

func update():
	device.visible=module_id not in game.session.expedition_gear.recovered
	for body in device_bodies:body.collision_layer=1 if device.visible else 0
	# A full drifting-cargo pool must not silently discard the demonstration load.
	if not device.visible and module_id=="salvage-crane" and not state().trialSpawned:
		state().trialSpawned=game.salvage.spawn_heavy(root.to_global(Vector3(4.6,.1,2.2)),true)
func point_text(_id: String) -> String:return ""
func service_ready() -> bool:return false
func finish_service():pass

func interact(id: String):
	var s=game.session;var c=s.contacts.active
	if c.get("state","") not in ["docked","visited"] or s.health<=0 or game.combat.active_threat():return
	var point={}
	for p in owner_site.points:
		if p.id==id:point=p
	if point.is_empty() or game.player.position.distance_to(root.to_global(point.at)-Vector3.UP*.7)>2.2:return
	var st=state()
	if id=="gear-record":
		st.record=true
		var message={"salvage-crane":"A human operator and a machine technician signed the same load book. Their last instruction: recover the gantry drive, fit the D3 connection on the Nomad's upper starboard deck, then use its controls to lift the sealed cargo. A handheld hook cannot lift it.","battery-bank":"The station kept a receiver alive after its generators failed. Fit this bank to the D2 connection on the middle service deck. It charges from unused generation and can back up the receiver, helm and fieldwork tools for a short time; propulsion still needs fuel.","quiet-drive":"The relay crew insulated their drive train to slip past listening patrols. Fit this assembly to the D1 connection on the lower drive deck and switch it on at its controls. The Nomad runs slower and produces less power, while scouts need longer to identify it. It cannot erase a broadcast already sent."}[module_id]
		game.ui.show_record(MMFNativeProgression.MODULES[module_id].site,message)
		return
	if not MMFNativeProgression.eligible(s,module_id) or module_id in s.expedition_gear.recovered or not point_visible(id):return
	if id=="gear-isolate":st.step=1;s.notify("Feed isolated. Release the retaining locks across the platform.")
	elif id=="gear-release":st.step=2;s.notify("Locks released. The assembly can be recovered.")
	elif id=="gear-recover":
		s.expedition_gear.recovered.append(module_id);s.expedition_gear.lastRecoveryDistance=s.distance
		c.state="visited"
		s.notify(MMFNativeProgression.MODULES[module_id].name+" recovered. Return aboard and install it from Build.")
		game.journey.enqueue("gear/"+module_id,"RECOVERY LOG",MMFNativeProgression.MODULES[module_id].name+" secured. Its installation is now available in Build; the assembly still needs a supported deck and fitting materials.")
		var practice={"salvage-crane":"Heavy cargo is waiting beside this platform. Fit the crane, then operate it locally to try the hoist.","battery-bank":"Let the installed bank charge from spare generation, then use CHECK BACKUP RESERVE at the bank to see which navigation systems it can support.","quiet-drive":"Compare normal and quiet generation at the installed assembly. Quiet running halves scout detection buildup while reducing speed and available power."}
		game.journey.enqueue("gear-practice/"+module_id,"SERVICE NOTE",practice[module_id])
		if module_id=="salvage-crane" and not st.trialSpawned:
			st.trialSpawned=game.salvage.spawn_heavy(root.to_global(Vector3(4.6,.1,2.2)),true)
	update();owner_site.refresh_labels()

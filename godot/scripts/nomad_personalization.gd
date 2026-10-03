class_name MMFNomadPersonalization
extends RefCounted
## Patchcoat: optional earned restoration and instance-local, reversible finishes.
const PART="recovered-finish-parts"
const PALETTE_IDS=["petrol","oxblood","denim","plum","celadon","clay","olive","umber","slate","verdigris","heather","ochre","rose","stone"]
const ZONES=["lockers","benches"]
const PROJECTS={
	"returning-signal":{"piece":"nomad-radio-cabinet","name":"Returning Signal","finish":"petrol","text":"Restore a familiar petrol-blue finish and name this cabinet Returning Signal. A cosmetic keepsake; its hardware stays as built and it does not receive transmissions."},
	"first-route":{"piece":"nomad-memory-board","name":"First Route archive","finish":"stone","text":"Refinish the archive board in warm stone and dedicate it to your first route. A cosmetic keepsake; its route cards stay as found and it grants no navigation bonus."},
	"road-rest":{"piece":"nomad-field-chair","name":"Road Rest","finish":"oxblood","text":"Restore the chair's faded oxblood finish and make it your Road Rest keepsake. A cosmetic finish; its upholstery stays as built and it does not heal the player."}
}
const RESTORE_COST={PART:3,"scrap":6}
const PAINT_COST={"scrap":2}
const PROJECT_COST={PART:1,"scrap":4}
var game
var machine: Node3D
var config: Dictionary={}
var preview_root: WeakRef
var preview_spec={}
var preview_finish="original"
var selection="zone:lockers"
var selected_finish="petrol"

static func defaults() -> Dictionary:
	return {"format":1,"restored":false,"machinePaint":{"lockers":"original","benches":"original"},"serviceMark":"none","projects":[]}

static func finish_valid(value) -> bool:
	return value is String and (value=="original" or value in PALETTE_IDS)

static func piece_eligible(id: String) -> bool:
	return id=="generator" or MMFArt100Decor.PIECES.has(id) or MMFArt200Decor.PIECES.has(id)

static func valid(value,facts: Dictionary={}) -> bool:
	if not value is Dictionary or value.size()!=5 or not (value.get("format") is int or value.get("format") is float) or value.format!=1 or not value.get("restored") is bool:return false
	if not value.get("machinePaint") is Dictionary or value.machinePaint.size()!=2:return false
	for zone in ZONES:
		if not finish_valid(value.machinePaint.get(zone)):return false
	if value.get("serviceMark") not in ["none","g01"]:return false
	if value.serviceMark=="g01" and facts.get("guardianOutcome","") not in ["destroyed","disarmed","evaded"]:return false
	if not value.get("projects") is Array or value.projects.size()>3:return false
	var seen={}
	for id in value.projects:
		if not id is String or not PROJECTS.has(id) or seen.has(id):return false
		seen[id]=true
	if not value.restored and (value.serviceMark!="none" or not value.projects.is_empty() or value.machinePaint.values().any(func(id):return id!="original")):return false
	return true

static func valid_piece(piece) -> bool:
	if not piece is Dictionary or not piece.get("state",{}) is Dictionary:return false
	var state=piece.get("state",{})
	if state.has("finish") and (not finish_valid(state.finish) or not piece_eligible(str(piece.get("definitionId","")))):return false
	if state.has("restoration"):
		if not state.restoration is String or not PROJECTS.has(state.restoration):return false
		if PROJECTS[state.restoration].piece!=piece.get("definitionId"):return false
	return true

static func valid_session(value,pieces,facts: Dictionary={}) -> bool:
	if not valid(value,facts) or not pieces is Array:return false
	var attached={}
	for piece in pieces:
		if not valid_piece(piece):return false
		var state=piece.get("state",{})
		if (state.has("finish") or state.has("restoration")) and not value.restored:return false
		if state.has("restoration"):
			if state.restoration not in value.projects or attached.has(state.restoration):return false
			attached[state.restoration]=true
	return true

static func apply_data(data: Dictionary):
	data.ITEMS[PART]={"id":PART,"name":"Recovered finish parts","category":"resource","stackSize":6,"weight":.3,"glyph":"+","description":"Salvaged seals, bristles and pigment tins. Restore Patchcoat tools at a workbench, then personalize an owned keepsake."}
	if PART not in data.ITEM_IDS:data.ITEM_IDS.append(PART)
	if data.BUILD_PIECES.has("nomad2-paint-trolley"):data.BUILD_PIECES["nomad2-paint-trolley"].description="A physical finish console with sample panels and brush cups. Restore Patchcoat tools at a workbench, then apply cosmetic finishes or restore an owned keepsake here."

static func salvage_reward(s,contents: Dictionary) -> Dictionary:
	var result=contents.duplicate(true)
	if (not s.customization.restored or s.customization.projects.size()<PROJECTS.size()) and s.count_resource(PART)<3:result[PART]=int(result.get(PART,0))+1
	return result

func setup(owner_game):
	game=owner_game
	config=MMFAssets.json("res://data/nomad-personalization.json")

func bind_piece(root: Node3D,piece: Dictionary):
	if not valid_piece(piece) or not config.pieces.has(piece.get("definitionId","")):return
	MMFNomadFinishView.apply(MMFNomadFinishView.plan(root,config.pieces[piece.definitionId],config.palette,piece.get("state",{}).get("finish","original")))

func bind_machine(root: Node3D):
	machine=root
	for zone in ZONES:
		var target=_zone_root(zone)
		if target:MMFNomadFinishView.apply(MMFNomadFinishView.plan(target,config.zones[zone].materials,config.palette,game.session.customization.machinePaint[zone]))
	_bind_mark()

func _zone_root(zone: String) -> Node3D:
	return MMFAssets.find_named(machine,config.zones[zone].anchor) if is_instance_valid(machine) and config.zones.has(zone) else null

func _bind_mark():
	if not is_instance_valid(machine):return
	var anchor=MMFAssets.find_named(machine,"CargoLocker1")
	if not anchor:return
	var mark=anchor.get_node_or_null("NomadServiceMark")
	var enabled=game.session.customization.serviceMark=="g01" and game.session.facts.get("guardianOutcome","") in ["destroyed","disarmed","evaded"]
	if not mark and enabled:
		mark=Label3D.new();mark.name="NomadServiceMark";mark.text="G–01";mark.font_size=40;mark.pixel_size=.0024
		mark.modulate=Color("bdb09b");mark.outline_size=0;mark.shaded=true;mark.double_sided=false
		mark.position=Vector3(0,.585,-.463);mark.rotation.y=PI;anchor.add_child(mark)
	if mark:mark.visible=enabled

func reset_preview():
	if preview_root:
		var target=preview_root.get_ref()
		if is_instance_valid(target):MMFNomadFinishView.apply(MMFNomadFinishView.plan(target,preview_spec,config.palette,preview_finish))
	preview_root=null;preview_spec={};preview_finish="original"

func _authority(station_id: String,workbench: bool=false) -> bool:
	var s=game.session
	if not game.started or not game.menu_open or game.cinematic!="" or s.health<=0 or s.attack_recent>0 or game.combat.active_threat():return false
	if not game.aboard() or game.ui.storage_id!=station_id or game.ui.page!=("Workshop" if workbench else "Painter"):return false
	var station=s.find_piece(station_id)
	var kind="workbench" if workbench else "nomad2-paint-trolley"
	if station.is_empty() or station.definitionId!=kind or station.health<=0 or game.ui.station_kind!=kind:return false
	var body=game.building.bodies.get(station_id)
	if not is_instance_valid(body) or game.player.global_position.distance_to(body.global_position)>2.6:return false
	if workbench:return s.powered.get(station_id,true) and s.scanner.phase not in ["awaiting-receiver","awaiting-module"]
	return s.customization.restored

func _piece_target(id: String) -> Dictionary:
	var p=game.session.find_piece(id)
	if p.is_empty() or p.health<=0 or not piece_eligible(p.definitionId):return {}
	var target=game.building.bodies.get(id)
	if not is_instance_valid(target):return {}
	return {"root":target,"piece":p,"spec":config.pieces[p.definitionId],"finish":p.state.get("finish","original")}

func _complete(event: String,details: Dictionary,message: String):
	game.session.transaction.emit(event,details);game.session.notify(message)
	if game.menu_open:game.ui.refresh()

func restore_tools(station_id: String) -> bool:
	if not _authority(station_id,true) or game.session.customization.restored:return false
	if not game.session.pay(RESTORE_COST):return false
	game.session.customization.restored=true
	game.session.piece_used.emit(station_id,"Restored Patchcoat tools")
	_complete("patchcoat_restored",{"station":station_id,"cost":RESTORE_COST.duplicate()},"Patchcoat tools restored. Build or use a paint trolley to choose a finish.")
	return true

func paint_piece(station_id: String,target_id: String,finish: String) -> bool:
	if not _authority(station_id) or not finish_valid(finish):return false
	var target=_piece_target(target_id)
	if target.is_empty() or target.finish==finish:return false
	var plan=MMFNomadFinishView.plan(target.root,target.spec,config.palette,finish)
	if plan.is_empty() or not game.session.pay(PAINT_COST):return false
	reset_preview();target.piece.state.finish=finish;MMFNomadFinishView.apply(plan)
	game.session.piece_used.emit(target_id,"Painted finish")
	game.session.piece_used.emit(station_id,"Used Patchcoat tools")
	_complete("piece_painted",{"piece":target_id,"finish":finish,"cost":PAINT_COST.duplicate()},"Finish applied.")
	return true

func paint_machine(station_id: String,zone: String,finish: String) -> bool:
	if not _authority(station_id) or zone not in ZONES or not finish_valid(finish):return false
	if game.session.customization.machinePaint[zone]==finish:return false
	var plan=MMFNomadFinishView.plan(_zone_root(zone),config.zones[zone].materials,config.palette,finish)
	if plan.is_empty() or not game.session.pay(PAINT_COST):return false
	reset_preview();game.session.customization.machinePaint[zone]=finish;MMFNomadFinishView.apply(plan)
	game.session.piece_used.emit(station_id,"Used Patchcoat tools")
	_complete("machine_painted",{"zone":zone,"finish":finish,"cost":PAINT_COST.duplicate()},"Machine enamel refinished.")
	return true

func set_service_mark(station_id: String,mark: String) -> bool:
	if not _authority(station_id) or mark not in ["none","g01"] or game.session.customization.serviceMark==mark:return false
	if mark=="g01" and game.session.facts.get("guardianOutcome","") not in ["destroyed","disarmed","evaded"]:return false
	if not is_instance_valid(machine) or not MMFAssets.find_named(machine,"CargoLocker1"):return false
	game.session.customization.serviceMark=mark;_bind_mark()
	game.session.piece_used.emit(station_id,"Applied service mark")
	_complete("service_mark_changed",{"mark":mark},"Service mark applied." if mark=="g01" else "Service mark removed.")
	return true

func restore_project(station_id: String,project_id: String,target_id: String) -> bool:
	if not _authority(station_id) or not PROJECTS.has(project_id) or project_id in game.session.customization.projects:return false
	var target=_piece_target(target_id);var project=PROJECTS[project_id]
	if target.is_empty() or target.piece.definitionId!=project.piece or target.piece.state.has("restoration"):return false
	var plan=MMFNomadFinishView.plan(target.root,target.spec,config.palette,project.finish)
	if plan.is_empty() or not game.session.pay(PROJECT_COST):return false
	reset_preview();target.piece.state.finish=project.finish;target.piece.state.restoration=project_id
	game.session.customization.projects.append(project_id);MMFNomadFinishView.apply(plan)
	game.session.piece_used.emit(target_id,"Restored keepsake");game.session.piece_used.emit(station_id,"Restored keepsake")
	_complete("keepsake_restored",{"project":project_id,"piece":target_id,"cost":PROJECT_COST.duplicate()},project.name+" restored. This keepsake is yours.")
	return true

func preview(station_id: String,target_key: String,finish: String) -> bool:
	if not _authority(station_id) or not finish_valid(finish):return false
	var target={}
	if target_key.begins_with("zone:"):
		var zone=target_key.trim_prefix("zone:")
		if zone not in ZONES:return false
		target={"root":_zone_root(zone),"spec":config.zones[zone].materials,"finish":game.session.customization.machinePaint[zone]}
	else:target=_piece_target(target_key)
	if target.is_empty():return false
	var plan=MMFNomadFinishView.plan(target.root,target.spec,config.palette,finish)
	if plan.is_empty():return false
	reset_preview();preview_root=weakref(target.root);preview_spec=target.spec;preview_finish=target.finish
	MMFNomadFinishView.apply(plan);return true

func render_workbench(ui,station_id: String):
	ui.section("PATCHCOAT RESTORATION")
	if game.session.customization.restored:
		ui.text_line("Tool set restored. A paint trolley applies muted finishes and restores personal keepsakes. You can build furnishings before restoring these tools.");return
	ui.text_line("Recover seals, bristles and pigment tins from ordinary cargo. After repairing the receiver, restore the tool set here: 3 recovered finish parts + 6 scrap. The paint trolley is needed only when you are ready to apply a finish.")
	ui.text_line("Recovered finish parts: %d / 3"%game.session.count_resource(PART))
	ui.button("RESTORE PATCHCOAT TOOLS · 3 finish parts + 6 scrap",func():restore_tools(station_id),_authority(station_id,true) and game.session.can_pay(RESTORE_COST))

func render_painter(ui,station_id: String):
	MMFNomadPaintPage.render(self,ui,station_id)

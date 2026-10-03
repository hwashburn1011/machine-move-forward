class_name MMFSalvageTool
extends Node3D

const REACH=3.2
const HOLD_SECONDS=1.4
const LOCKER_AT=Vector3(2.4,16.04,-1.8)
var game
var building
var locker: Node3D
var locker_label: Label3D
var progress=0.0
var target_id=""
var target_point=Vector3.ZERO
var preview={}
var highlighted: Array=[]
var glow=StandardMaterial3D.new()
var latched=false
var effect_clock=0.0

func setup(owner_building):
	building=owner_building;game=building.game
	glow.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED
	glow.transparency=BaseMaterial3D.TRANSPARENCY_ALPHA
	glow.albedo_color=Color(.45,.92,.62,.24)
	locker=MMFAssets.scene("res://art/native-salvage-locker.glb")
	add_child(locker);locker.position=LOCKER_AT
	MMFAssets.collider(locker,{"position":{"y":.35},"half":{"x":.4,"y":.35,"z":.25}})
	locker_label=Label3D.new();locker_label.position=Vector3(0,.98,0);locker_label.font_size=25;locker_label.pixel_size=.006
	locker_label.billboard=BaseMaterial3D.BILLBOARD_ENABLED;locker_label.visibility_range_end=6
	locker.add_child(locker_label)

func acquired() -> bool: return game.session.survivor_content.toolAcquired
func equipped() -> bool: return acquired() and game.session.survivor_content.toolSelected
func working() -> bool: return equipped() and progress>0 and not game.menu_open

func nearest_locker() -> Dictionary:
	if acquired() or game.player.position.distance_to(LOCKER_AT)>2.1: return {}
	return {"text":"[{key:use}] RECOVER SALVAGE CUTTER"}

func acquire() -> bool:
	if nearest_locker().is_empty() or game.menu_open or game.cinematic!="": return false
	game.session.survivor_content.toolAcquired=true
	game.session.notify("Salvage cutter recovered. [{key:salvage_tool}] selects it; hold [{key:demolish}] on a nearby owned piece to dismantle.")
	return true

func set_equipped(value: bool) -> bool:
	if value and not acquired():
		game.session.notify("Recover the salvage cutter from the tool locker beside your landing point.")
		return false
	game.session.survivor_content.toolSelected=value
	cancel()
	if value:
		building.cancel()
		game.player.cancel_reload()
		game.player.suppress_fire=true
	game.session.changed.emit()
	return true

func cancel():
	progress=0;target_id="";preview={};latched=false
	clear_highlight()

func clear_highlight():
	for mesh in highlighted:
		if is_instance_valid(mesh): mesh.material_overlay=null
	highlighted.clear()

func _unhandled_input(event):
	if not game or game.menu_open or game.cinematic!="" or game.session.health<=0 or game.manual_turret!="": return
	if event.is_action_pressed("salvage_tool"):
		set_equipped(not equipped());get_viewport().set_input_as_handled()
	if equipped() and event.is_action_pressed("build"): set_equipped(false)

func target_under_cursor() -> Dictionary:
	var hit=game.crosshair_hit(9)
	if hit.is_empty() or not hit.collider.has_meta("piece_id"): return {}
	if (game.player.position+Vector3.UP).distance_to(hit.position)>REACH: return {}
	# The camera can look around corners. The operator still needs an unobstructed
	# working line from their chest to the contact, independent of the camera.
	var direct=game.raycast(game.player.position+Vector3.UP,hit.position,[game.player.get_rid()],1)
	if not direct.is_empty() and direct.collider!=hit.collider and direct.collider.get_meta("piece_id","")!=hit.collider.get_meta("piece_id"): return {}
	return {"id":hit.collider.get_meta("piece_id"),"at":hit.position}

func update(dt: float):
	if locker_label:
		locker_label.visible=not acquired() and game.started and game.cinematic==""
		locker_label.text=game.hint("TOOL LOCKER · [{key:use}]")
	if not equipped() or game.menu_open or game.cinematic!="" or game.session.health<=0 or game.manual_turret!="" or game.session.attack_recent>0:
		cancel();return
	var target=target_under_cursor()
	var next_id=target.get("id","")
	if next_id!=target_id:
		cancel();target_id=next_id
	if target_id=="": return
	target_point=target.at
	preview=building.dismantle_preview(target_id)
	if highlighted.is_empty():
		for id in preview.get("pieces",[]):
			if building.bodies.has(id):
				for mesh in MMFAssets.of_type(building.bodies[id],"MeshInstance3D"):
					mesh.material_overlay=glow;highlighted.append(mesh)
	glow.albedo_color=Color(.5,.93,.66,.22) if preview.get("refusal","")=="" else Color(.95,.49,.18,.25)
	var held=Input.is_action_pressed("demolish")
	if not held: progress=0;latched=false;return
	if latched or preview.get("refusal","")!="": return
	progress=minf(1,progress+dt/HOLD_SECONDS)
	effect_clock-=dt
	if effect_clock<=0:
		effect_clock=.18
		game.audio.cue(130,.055,-35,true)
		game.effects.particle(target_point,Vector3.UP*.5,Color(.85,.67,.28),.025,.18)
	if progress>=1:
		# Re-evaluate the target and entire transaction at completion. No funds
		# move while previewing or canceling; the existing demolition owns commit.
		var current=target_under_cursor()
		if current.get("id","")==target_id and building.dismantle_preview(target_id).get("refusal","")=="": building.demolish(target_id)
		progress=0;latched=true;clear_highlight()

func prompt() -> String:
	if not equipped(): return ""
	if target_id=="": return "SALVAGE CUTTER · aim at an owned piece within 3.2 m · [{key:rifle}/{key:shotgun}] weapon"
	if preview.get("refusal","")!="": return "SALVAGE CUTTER · "+preview.refusal
	var materials=[]
	for id in preview.get("refund",{}): materials.append("%d %s"%[preview.refund[id],id])
	return "HOLD [{key:demolish}] DISMANTLE · %d%% · %d piece(s) · recover %s"%[int(progress*100),preview.get("pieces",[]).size(),", ".join(materials)]

class_name MMFLootReadout
extends Control

var game
var label: Label
var receipt: Label
var selected={}
var selection_clock=0.0
var received={}
var receipt_left=0.0
var receipt_age=0.0

func setup(owner_game):
	game=owner_game;mouse_filter=Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	label=Label.new();receipt=Label.new()
	for text in [label,receipt]:
		text.mouse_filter=Control.MOUSE_FILTER_IGNORE;text.add_theme_font_size_override("font_size",16)
		text.add_theme_color_override("font_shadow_color",Color.BLACK)
		text.add_theme_constant_override("shadow_offset_x",1);text.add_theme_constant_override("shadow_offset_y",2)
		add_child(text);text.hide()
	label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	var backing=StyleBoxFlat.new();backing.bg_color=Color(.015,.035,.035,.86)
	backing.set_content_margin_all(6);label.add_theme_stylebox_override("normal",backing)
	receipt.modulate=Color(.5,.92,.8)

func title(id: String) -> String:return game.data.ITEMS.get(id,{}).get("name",id)

func record(id: String,count: int):
	if count<=0:return
	if receipt_left<=0 or receipt_age>.5:received.clear()
	received[id]=received.get(id,0)+count;receipt_left=2.5;receipt_age=0
	var parts=[]
	for key in received:parts.append("%s +%d"%[title(key),received[key]])
	receipt.text="RECOVERED  ·  "+"  /  ".join(parts)
	MMFWristLog.append(game.session,receipt.text)
	selection_clock=0

func clear():
	selected={};received.clear();receipt_left=0;receipt_age=0;selection_clock=0;label.hide();receipt.hide()

func visible_at(item: Dictionary) -> bool:
	if not is_instance_valid(item.node) or not item.has("view") or item.view.is_empty():return false
	var at: Vector3=item.view.world.origin+Vector3.UP*.10
	var camera=game.player.camera
	if camera.is_position_behind(at) or not get_rect().grow(-36).has_point(camera.unproject_position(at)):return false
	return game.ui.salvage_readout.clear_sight(at)

func choose():
	selected={};var candidates=[]
	for item in game.combat.loot:
		if item.node.global_position.distance_squared_to(game.player.global_position)<36:candidates.append(item)
	candidates.sort_custom(func(a,b):return a.node.global_position.distance_squared_to(game.player.global_position)<b.node.global_position.distance_squared_to(game.player.global_position))
	for i in mini(6,candidates.size()):
		if visible_at(candidates[i]):selected=candidates[i];break
	if selected.is_empty():return
	var total=0
	for item in game.combat.loot:
		if item.id==selected.id and item.has("view") and not item.view.is_empty() and item.view.world.origin.distance_to(selected.view.world.origin)<.02:total+=item.count
	var room=game.session.resource_room(selected.id)
	label.text="%s ×%d\n%s"%[title(selected.id),total,"STORAGE FULL" if room==0 else "APPROACH TO RECOVER"]
	label.modulate=Color(1,.73,.38) if room==0 else Color(.5,.94,.84)

func update(dt: float):
	var readable=game.started and not game.menu_open and game.cinematic=="" and game.session.health>0
	if not readable:label.hide();receipt.hide();return
	receipt_left=maxf(0,receipt_left-dt);receipt_age+=dt
	receipt.hide()
	receipt.position=Vector2(28,size.y-65);receipt.size=Vector2(maxf(100,size.x-56),40)
	if game.building.selected!="" or game.manual_turret!="":label.hide();return
	selection_clock-=dt
	if selection_clock<=0:selection_clock=.25;choose()
	if selected.is_empty() or not is_instance_valid(selected.node) or not game.combat.loot.has(selected) or not selected.has("view") or selected.view.is_empty():label.hide();return
	if not visible_at(selected):label.hide();return
	# Anchor below the actual supporting base so text does not cover the model.
	var at: Vector3=selected.view.world.origin
	var camera=game.player.camera
	if camera.is_position_behind(at):label.hide();return
	var point=camera.unproject_position(at)
	if not get_rect().grow(-36).has_point(point):label.hide();return
	label.position=Vector2(clampf(point.x-145,8,maxf(8,size.x-298)),minf(point.y+18,size.y-110));label.size=Vector2(290,56);label.show()

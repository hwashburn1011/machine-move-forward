class_name MMFSalvageReadout
extends Control

# One quiet screen-space bracket identifies the cargo near the player's aim.
# It describes the existing physical throw; it never steers or widens the hook.
var game
var label: Label
var aligned=-1
var selected=-1
var tint=Color(.95,.69,.32)
var bracket=Rect2()
var lead=Vector2.ZERO
var show_lead=false
var occlusion_excludes=[]

func setup(owner_game):
	game=owner_game;mouse_filter=Control.MOUSE_FILTER_IGNORE
	occlusion_excludes=[game.player.get_rid()]
	# This flat physics safety proxy is not the rendered dune surface. It can
	# sit above visible cargo in a trough, so it must not occlude the readout.
	var ground=game.world.get_node_or_null("RadioactiveDesert")
	if ground:occlusion_excludes.append(ground.get_rid())
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	label=Label.new();label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size",16)
	label.add_theme_color_override("font_shadow_color",Color.BLACK)
	label.add_theme_constant_override("shadow_offset_x",1);label.add_theme_constant_override("shadow_offset_y",2)
	add_child(label);hide()

func clear_sight(to: Vector3) -> bool:
	var exclude=occlusion_excludes.duplicate()
	for layer in 6:
		var hit=game.raycast(game.player.camera.global_position,to,exclude)
		if hit.is_empty():return true
		if not hit.collider.get_meta("open_railing",false):return false
		exclude.append(hit.collider.get_rid())
	return false

func update():
	aligned=-1;selected=-1
	if not game.started or game.menu_open or game.cinematic!="" or game.session.health<=0 or game.building.selected!="" or game.manual_turret!="":hide();return
	var salvage=game.salvage
	if salvage.busy():selected=salvage.reel_index
	else:
		aligned=salvage.aimed_crate();selected=aligned if aligned>=0 else salvage.nearby_crate()
	if selected<0:hide();return
	var node=salvage.crates[selected].node;var camera=game.player.camera
	var at=node.get_global_transform_interpolated().origin
	if camera.is_position_behind(at):aligned=-1;hide();return
	var screen=camera.unproject_position(at)
	if not get_rect().grow(-30).has_point(screen):aligned=-1;hide();return
	# Avoid exposing crates through the machine's solid walls/other structures.
	var visible_part=false
	for offset in [Vector3.ZERO,Vector3.UP*.45,camera.global_basis.x*.68]:
		if clear_sight(at+offset):visible_part=true;break
	if not visible_part:aligned=-1;hide();return
	var radius=clampf(camera.unproject_position(at+camera.global_basis.x*.95).distance_to(screen),16,65)
	bracket=Rect2(screen-Vector2.ONE*radius,Vector2.ONE*radius*2)
	var distance=salvage.hand_position().distance_to(node.position)
	var state="REELING" if salvage.busy() else "READY" if aligned>=0 else "OUT OF REACH" if distance>salvage.REEL_RANGE+salvage.CATCH_RADIUS else "ALIGN TO DIAMOND"
	show_lead=not salvage.busy() and distance<=salvage.REEL_RANGE+salvage.CATCH_RADIUS
	if show_lead:
		# Project a direction from the camera so its diamond coincides with the
		# crosshair for the correct hand-launched path, despite shoulder offset.
		lead=camera.unproject_position(camera.global_position+salvage.suggested_direction(selected)*maxf(distance,1))
	tint=Color(.45,.95,.86) if aligned>=0 or salvage.busy() else Color(.95,.69,.32)
	label.text="CARGO · %dm\n%s"%[roundi(distance),state]
	label.position=Vector2(clampf(screen.x-160,4,maxf(4,size.x-324)),minf(screen.y+radius+7,size.y-60))
	label.size=Vector2(320,48);label.modulate=tint
	show();queue_redraw()

func _draw():
	var length=minf(12,bracket.size.x*.25)
	for corner in [Vector2(0,0),Vector2(1,0),Vector2(0,1),Vector2(1,1)]:
		var at=bracket.position+bracket.size*corner
		var x=Vector2(1 if corner.x==0 else -1,0)*length
		var y=Vector2(0,1 if corner.y==0 else -1)*length
		draw_line(at,at+x,Color(0,0,0,.7),4,true);draw_line(at,at+y,Color(0,0,0,.7),4,true)
		draw_line(at,at+x,tint,2,true);draw_line(at,at+y,tint,2,true)
	if show_lead:
		var diamond=PackedVector2Array([lead+Vector2(0,-5),lead+Vector2(5,0),lead+Vector2(0,5),lead+Vector2(-5,0),lead+Vector2(0,-5)])
		draw_polyline(diamond,Color(0,0,0,.7),4,true);draw_polyline(diamond,tint,2,true)

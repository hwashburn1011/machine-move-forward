class_name MMFAimReticle
extends Control

# Damage attribution lives at the attack boundary. Only confirm_player_hit()
# calls confirm(); informational enemy hit text cannot flash this reticle.
var game
var hit_left=0.0
var pulse_count=0
var spread=7.0

func _ready():
	mouse_filter=Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

func confirm():
	hit_left=.18
	pulse_count+=1
	queue_redraw()

func _process(dt: float):
	if not game or not game.player: return
	var salvage=game.building.get("salvage_tool")
	visible=game.started and not game.menu_open and game.cinematic=="" and game.session.health>0 and game.building.selected=="" and (not salvage or not salvage.equipped()) and not game.player.equipment.terminal_presenting()
	hit_left=maxf(0,hit_left-dt)
	spread=lerpf(spread,(4.0 if game.player.aiming else 8.0)+game.player.recoil*60,1-exp(-20*dt))
	if visible:queue_redraw()

func _draw():
	var center=size*.5
	if game and game.manual_turret!="":
		var point=game.get("manual_aim_point")
		if point is Vector3 and point.is_finite() and not game.player.camera.is_position_behind(point):
			center=game.player.camera.unproject_position(point)
	var pulse=hit_left/.18
	var color=Color(.76,.87,.77,.85).lerp(Color(.96,.42,.40,.96),pulse)
	draw_circle(center,1.5,color)
	for direction in [Vector2.LEFT,Vector2.RIGHT,Vector2.UP,Vector2.DOWN]:
		draw_line(center+direction*spread,center+direction*(spread+4),Color(.01,.02,.01,.7),3,true)
		draw_line(center+direction*spread,center+direction*(spread+4),color,1.25,true)
	# A short diagonal confirmation survives color-vision differences.
	if hit_left>0:
		for direction in [Vector2(-1,-1),Vector2(1,-1),Vector2(-1,1),Vector2(1,1)]:
			draw_line(center+direction*5,center+direction*(7+2*pulse),color,1.5,true)

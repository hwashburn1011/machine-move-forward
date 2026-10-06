class_name MMFWristTerminal
extends Node

# Only personal information belongs on the forearm. Station controls and the
# construction catalog use the main viewport and never take the wrist camera.
const SCREEN_SIZE=Vector2(.252,.178)
const SCREEN_CENTER=Vector3(-.018,.009,.039)
const DISPLAY_SIZE=Vector2i(1120,792)
var game
var ui
var viewport: SubViewport
var display_root: Control
var screen: MeshInstance3D
var device: Node3D
var camera: Camera3D
var active=false
var blend=0.0
var closing=false
var start_transform=Transform3D.IDENTITY
var elapsed=0.0
var last_mouse=Vector2(-1,-1)
var screen_material: ShaderMaterial
var last_display_tick=0.0
var selector: Node3D
var selector_angle=0.0
var selector_target=0.0
var click_voice: AudioStreamPlayer
var pointer_inside=false

func setup(owner_ui):
	ui=owner_ui;game=ui.game;process_mode=Node.PROCESS_MODE_ALWAYS
	device=game.player.equipment.wrist
	screen=MMFAssets.find_named(device,"ScreenSurface")
	selector=MMFAssets.find_named(device,"SelectorDial")
	click_voice=AudioStreamPlayer.new();add_child(click_voice)
	click_voice.stream=game.audio.cue_stream(240,.025,true)
	viewport=SubViewport.new();viewport.name="WristDisplay";viewport.size=DISPLAY_SIZE
	viewport.disable_3d=true;viewport.render_target_update_mode=SubViewport.UPDATE_DISABLED
	viewport.gui_embed_subwindows=true;viewport.handle_input_locally=true
	add_child(viewport)
	display_root=Control.new();display_root.name="LiveTerminalPages";display_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	display_root.theme=ui.root.theme;viewport.add_child(display_root)
	var shader=Shader.new()
	shader.code="""shader_type spatial;
render_mode unshaded, cull_disabled;
uniform sampler2D display_texture : source_color, filter_linear;
uniform bool screen_grain = false;
uniform bool display_live = false;
uniform float glow = 0.06;
void fragment() {
 vec3 ink=vec3(0.006,0.017,0.008);
 if (display_live) { ink=texture(display_texture,UV).rgb; }
 float scan=screen_grain ? 0.975+0.025*sin(UV.y*792.0*3.14159) : 1.0;
 ALBEDO=ink*scan;
 EMISSION=ink*glow;
}
"""
	screen_material=ShaderMaterial.new();screen_material.shader=shader
	screen_material.set_shader_parameter("display_texture",viewport.get_texture())
	if screen:screen.material_override=screen_material;screen.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	camera=Camera3D.new();camera.name="WristReadingCamera";camera.near=.012;camera.far=1800;camera.fov=43
	game.add_child(camera)
	process_priority=95

func physical_page(which: String) -> bool:
	var personal=which in ["Inventory","Records"] or (which=="Record" and ui.record_back_page in ["","Inventory","Records"])
	return personal and game.started and game.session.health>0 and game.cinematic==""

func presenting() -> bool:
	return active or closing or blend>.001

func open(which: String):
	var physical=physical_page(which)
	if physical:
		selector_target+=PI/8
		if not game.audio.muted and game.audio.volume>0:
			click_voice.volume_linear=.11*game.audio.volume;click_voice.play()
		if not active:
			start_transform=game.player.camera.global_transform
			camera.global_transform=start_transform
			elapsed=0;active=true;closing=false
			game.player.set_camera_fade(0)
			camera.make_current()
		if ui.panel.get_parent()!=display_root:ui.panel.reparent(display_root)
		ui.panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		ui.panel.offset_left=0;ui.panel.offset_top=0;ui.panel.offset_right=0;ui.panel.offset_bottom=0
		viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS
		screen_material.set_shader_parameter("display_live",true)
		apply_preferences()
	else:
		finish_close()
		if ui.panel.get_parent()!=ui.root:ui.panel.reparent(ui.root)
		ui.panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		ui.panel.offset_left=90;ui.panel.offset_right=-90;ui.panel.offset_top=70;ui.panel.offset_bottom=-70

func apply_preferences():
	var scale=clampf(float(game.settings.get("terminal_text_scale",1.0)),.9,1.4)
	# A smaller logical viewport enlarges every control, including accessible
	# keyboard focus, without scaling the physical hardware or hit coordinates.
	viewport.size=Vector2i(Vector2(DISPLAY_SIZE)/scale)
	screen_material.set_shader_parameter("screen_grain",game.settings.get("terminal_scanlines",false))
	screen_material.set_shader_parameter("glow",.06 if game.settings.get("terminal_glow",true) else 0.0)
	ui.panel.queue_sort()

func target_transform() -> Transform3D:
	var basis=device.global_basis.orthonormalized()
	var center=device.to_global(SCREEN_CENTER)
	var physical_size=SCREEN_SIZE*device.global_basis.get_scale().x
	var aspect=game.get_viewport().get_visible_rect().size.aspect()
	var height=maxf(physical_size.y/.68,physical_size.x/(aspect*.70))
	var distance=height/(2*tan(deg_to_rad(camera.fov)*.5))
	return Transform3D(basis,center+basis.z*distance)

func _process(dt: float):
	if not game:return
	if presenting() and game.cinematic!="":finish_close();return
	if active and (not game.menu_open or not physical_page(ui.page)):
		active=false;closing=true;elapsed=0;start_transform=camera.global_transform
		viewport.render_target_update_mode=SubViewport.UPDATE_DISABLED
		screen_material.set_shader_parameter("display_live",false)
	if not presenting():return
	elapsed+=dt
	var reduced=game.settings.get("terminal_reduced_motion",false)
	if active:
		# Raise and pronate the forearm before approaching its glass. Following
		# the turning cuff immediately swept the camera through a floor-only
		# orientation halfway through opening from steep third-person views.
		blend=1.0 if reduced else move_toward(blend,1,dt/.18)
		var target=target_transform()
		var travel=1.0 if reduced else smoothstep(.20,.44,elapsed)
		camera.global_transform=start_transform.interpolate_with(target,travel)
		if travel>0 and travel<1:
			# Interpolating orientation alone can point below the cuff while the
			# camera approaches it. Follow a continuous focus point instead.
			var center=device.to_global(SCREEN_CENTER)
			var old_focus=start_transform.origin-start_transform.basis.z*start_transform.origin.distance_to(center)
			var up=start_transform.basis.y.lerp(target.basis.y,travel).normalized()
			camera.look_at(old_focus.lerp(center,travel),up)
		game.player.set_camera_fade(0)
		selector_angle=lerpf(selector_angle,selector_target,1-exp(-20*dt))
		if selector:selector.rotation.z=selector_angle
		# Current fuel/status text needs only a few updates a second; animation
		# remains smooth without rendering this UI texture every frame at rest.
		last_display_tick+=dt
		if last_display_tick>=.1:
			viewport.render_target_update_mode=SubViewport.UPDATE_ONCE;last_display_tick=0
	elif closing:
		blend=0.0 if reduced else move_toward(blend,0,dt/.20)
		camera.global_transform=start_transform.interpolate_with(game.player.camera.global_transform,1.0 if reduced else smoothstep(0,.22,elapsed))
		if elapsed>=.22 or reduced:finish_close()

func finish_close():
	if presenting() and camera.current and is_instance_valid(game.player.camera):game.player.camera.make_current()
	active=false;closing=false;blend=0;elapsed=0
	if viewport:viewport.render_target_update_mode=SubViewport.UPDATE_DISABLED
	if screen_material:screen_material.set_shader_parameter("display_live",false)
	if viewport and pointer_inside:viewport.notify_mouse_exited();pointer_inside=false
	if game and game.player:game.player.suppress_fire=true

func project_pointer(position: Vector2) -> Vector2:
	var origin=camera.project_ray_origin(position)
	var direction=camera.project_ray_normal(position)
	var frame=device.global_transform
	var normal=frame.basis.z.normalized()
	var denominator=normal.dot(direction)
	if absf(denominator)<.0001:return Vector2(-1,-1)
	var distance=normal.dot(device.to_global(SCREEN_CENTER)-origin)/denominator
	if distance<0:return Vector2(-1,-1)
	var point=device.to_local(origin+direction*distance)-SCREEN_CENTER
	var uv=Vector2(point.x/SCREEN_SIZE.x+.5,.5-point.y/SCREEN_SIZE.y)
	if uv.x<0 or uv.x>1 or uv.y<0 or uv.y>1:return Vector2(-1,-1)
	return uv*Vector2(viewport.size)

func _input(event):
	if not active or not game.menu_open or ui.binding_action!="":return
	if event is InputEventMouse:
		var point=project_pointer(event.position)
		if point.x>=0 and not pointer_inside:
			viewport.notify_mouse_entered();pointer_inside=true
		elif point.x<0 and pointer_inside:
			viewport.notify_mouse_exited();pointer_inside=false
		# Send an out-of-bounds release/motion to clear hover and cancel a
		# pressed row when the pointer leaves the glass during a drag.
		if point.x<0:
			if event is InputEventMouseButton and event.pressed:return
			point=Vector2(-100,-100)
		var forwarded=event.duplicate()
		forwarded.position=point;forwarded.global_position=point
		if event is InputEventMouseMotion:
			forwarded.relative=point-last_mouse if last_mouse.x>=0 else Vector2.ZERO
		last_mouse=point
		viewport.push_input(forwarded,true)
		viewport.render_target_update_mode=SubViewport.UPDATE_ONCE
		get_viewport().set_input_as_handled()
	elif event is InputEventKey:
		if event.is_action("terminal") or event.is_action("pause") or event.is_action("build"):return
		var adjusting=viewport.gui_get_focus_owner() is Range
		if event.pressed and event.keycode in [KEY_PAGEUP,KEY_PAGEDOWN] and not adjusting:
			ui.scroller.scroll_vertical+=int(ui.scroller.size.y*.8)*(-1 if event.keycode==KEY_PAGEUP else 1)
		elif event.pressed and not event.echo and event.keycode in [KEY_LEFT,KEY_RIGHT] and (event.alt_pressed or not adjusting):
			ui.cycle_terminal_page(-1 if event.keycode==KEY_LEFT else 1)
		else:viewport.push_input(event,true)
		viewport.render_target_update_mode=SubViewport.UPDATE_ONCE
		get_viewport().set_input_as_handled()

func redraw():
	if active:viewport.render_target_update_mode=SubViewport.UPDATE_ONCE

func _exit_tree():
	if click_voice:click_voice.stop();click_voice.stream=null
	if is_instance_valid(camera):camera.queue_free()

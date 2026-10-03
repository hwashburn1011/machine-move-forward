class_name MMFTitleScreen
extends Control

# A render-only scene: no session tick, collision bodies, encounters or saves.
# Its meshes/textures are shared with the game, but transforms, terrain uniforms
# and gait state belong exclusively to this presentation.
var game
var viewport: SubViewport
var stage: Node3D
var machine: Node3D
var camera: Camera3D
var environment: Environment
var terrain: ShaderMaterial
var rotor: Node3D
var gait=MMFGait.new()
var identity: Control
var brand: Label
var eyebrow: Label
var strapline: Label
var footer: Label
var menu_theme: Theme
var active=false
var elapsed=0.0
var distance=84.0
var was_disabled=false
var landmarks=[]
var panel_rect=Rect2()
var menu_origin=false
const SPEED=2.8
const FRONT_PAGES=["Title","Settings","Library","Checkpoints","Departure"]

func setup(owner_game):
	game=owner_game;name="DesertTitlePresentation"
	process_mode=Node.PROCESS_MODE_ALWAYS
	mouse_filter=Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	viewport=SubViewport.new();viewport.name="TitleWorld";viewport.own_world_3d=true
	viewport.render_target_update_mode=SubViewport.UPDATE_DISABLED
	viewport.gui_disable_input=true;viewport.physics_object_picking=false
	viewport.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	add_child(viewport)
	var picture=TextureRect.new();picture.texture=viewport.get_texture()
	picture.expand_mode=TextureRect.EXPAND_IGNORE_SIZE;picture.stretch_mode=TextureRect.STRETCH_SCALE
	picture.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);picture.mouse_filter=Control.MOUSE_FILTER_IGNORE;add_child(picture)
	var shade=ColorRect.new();shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);shade.mouse_filter=Control.MOUSE_FILTER_IGNORE
	var material=ShaderMaterial.new();material.shader=load("res://shaders/title_shade.gdshader");shade.material=material;add_child(shade)
	identity=Control.new();identity.mouse_filter=Control.MOUSE_FILTER_IGNORE;identity.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT);add_child(identity)
	var display_font=SystemFont.new();display_font.font_names=["Bahnschrift","Arial","Noto Sans"];display_font.font_weight=700
	brand=label("MACHINE\nMOVE\nFORWARD",88,Color("e2dfcf"));brand.add_theme_font_override("font",display_font);brand.add_theme_constant_override("line_spacing",-12)
	eyebrow=label("N O M A D   /   A   M O V I N G   H O M E",15,Color("b5b096"))
	strapline=label("Carry the names.\nKeep the machine moving.",22,Color("bcbdaa"));strapline.add_theme_constant_override("line_spacing",4)
	footer=label("PLAYABLE BETA  /  "+str(ProjectSettings.get_setting("application/config/version","development")),14,Color("a6a899"))
	menu_theme=game.ui.root.theme.duplicate()
	for key in ["font_color","font_hover_color","font_pressed_color","font_focus_color"]:menu_theme.set_color(key,"Button",Color("e0dece"))
	menu_theme.set_color("font_disabled_color","Button",Color("777e72"))
	var normal=StyleBoxFlat.new();normal.bg_color=Color.TRANSPARENT;normal.set_content_margin_all(12);normal.content_margin_left=20
	var hover=normal.duplicate();hover.bg_color=Color(.55,.59,.49,.13);hover.border_width_left=3;hover.border_color=Color("b9b59a")
	var focus=StyleBoxFlat.new();focus.bg_color=Color.TRANSPARENT;focus.border_width_left=3;focus.border_color=Color("e2cf9d")
	menu_theme.set_stylebox("normal","Button",normal);menu_theme.set_stylebox("disabled","Button",normal)
	menu_theme.set_stylebox("hover","Button",hover);menu_theme.set_stylebox("pressed","Button",hover);menu_theme.set_stylebox("focus","Button",focus)
	game.get_viewport().size_changed.connect(func():resize_view.call_deferred())
	set_process(false);hide()

func label(words: String,font_size: int,color: Color) -> Label:
	var node=Label.new();node.text=words;node.mouse_filter=Control.MOUSE_FILTER_IGNORE
	node.add_theme_font_size_override("font_size",font_size);node.add_theme_color_override("font_color",color)
	identity.add_child(node);return node

func prepare():
	if stage:return
	stage=Node3D.new();viewport.add_child(stage)
	# Duplicate just the visual hierarchy, never the compiled scene's physics.
	machine=game.world.machine.duplicate(0);stage.add_child(machine)
	# Some authored visual assemblies carry their own small colliders. Keep
	# their visible children, but strip every body from this noninteractive world.
	var bodies=MMFAssets.of_type(machine,"CollisionObject3D");bodies.reverse()
	for body in bodies:
		for child in body.get_children():
			if not child is CollisionShape3D and not child is CollisionPolygon3D:child.reparent(body.get_parent())
		body.free()
	gait.setup(game,machine);rotor=MMFAssets.find_named(machine,"Turbine_Rotor")
	for node in game.world.get_children():
		if node is MeshInstance3D and node.material_override==game.world.terrain_material:
			var sand=node.duplicate(0);terrain=game.world.terrain_material.duplicate();sand.material_override=terrain;stage.add_child(sand)
		elif node is DirectionalLight3D:
			var sun=node.duplicate(0);sun.directional_shadow_max_distance=150;stage.add_child(sun)
	var sky=WorldEnvironment.new();environment=game.world.world_environment.environment.duplicate();sky.environment=environment;stage.add_child(sky)
	environment.ambient_light_energy=.82;environment.fog_density=.0022
	camera=Camera3D.new();camera.fov=38;camera.near=.5;camera.far=900;stage.add_child(camera);camera.make_current()
	# Sparse, grounded silhouettes; replacements wrap well beyond the camera.
	for entry in [["billboard",68.0,36.0,11.0],["pylon",108.0,-88.0,9.0],["wreck-bus",53.0,145.0,9.0],["ruin-house",145.0,70.0,16.0]]:
		var source=game.world.prototypes.get(entry[0])
		if not source:continue
		var model=source.duplicate(0);var box=source.get_aabb();var scale_factor=entry[3]/maxf(box.size.x,box.size.z)
		model.scale=Vector3.ONE*scale_factor;model.rotation=Vector3(0,-.3,0)
		model.visibility_range_end=280;model.visibility_range_end_margin=70;model.visibility_range_fade_mode=GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF;stage.add_child(model)
		landmarks.append({"node":model,"x":entry[1],"z":entry[2],"base":box.position.y,"center":box.get_center(),"scale":scale_factor})
	update_scene(0)

func page_changed(page: String):
	if page=="Title":menu_origin=true
	var wanted=menu_origin and page in FRONT_PAGES
	if not wanted:menu_origin=false
	if wanted and not active:
		prepare();was_disabled=game.get_viewport().disable_3d;game.get_viewport().disable_3d=true
		stage.process_mode=Node.PROCESS_MODE_INHERIT;stage.show()
		active=true;show();viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS;set_process(true)
	elif not wanted:stop()
	identity.visible=page=="Title"
	if active:resize_view();apply_quality()

func stop():
	menu_origin=false
	if active:game.get_viewport().disable_3d=was_disabled
	active=false;hide();set_process(false);viewport.render_target_update_mode=SubViewport.UPDATE_DISABLED
	if stage:stage.process_mode=Node.PROCESS_MODE_DISABLED;stage.hide()

func apply_quality():
	if not stage:return
	var quality=game.settings.get("quality","high")
	viewport.msaa_3d=Viewport.MSAA_4X if quality=="high" else Viewport.MSAA_2X if quality=="medium" else Viewport.MSAA_DISABLED
	environment.ssao_enabled=quality=="high";environment.glow_enabled=quality!="low"
	viewport.positional_shadow_atlas_size=2048 if quality!="low" else 1024

func layout(view_size: Vector2) -> Rect2:
	var left=maxf(64,view_size.x*.055)
	var top=maxf(64,(view_size.y-900)*.5)
	eyebrow.position=Vector2(left,top)
	brand.position=Vector2(left-5,top+38)
	strapline.position=Vector2(left,top+336)
	footer.position=Vector2(left,view_size.y-51)
	panel_rect=Rect2(Vector2(left-20,top+432),Vector2(454,420))
	if active:resize_view()
	return panel_rect

func resize_view():
	# Render at physical window resolution, capped at 1080p. UI stays at its
	# own native resolution; small windows don't pay for a hidden 1920px render.
	var pixels=Vector2(game.get_viewport().get_window().size)
	var factor=minf(1.0,1080.0/maxf(pixels.y,1))
	viewport.size=Vector2i((pixels*factor).max(Vector2(64,64)))

func _process(dt: float):
	update_scene(minf(dt,.05))

func update_scene(dt: float):
	elapsed+=dt;distance+=dt*SPEED
	terrain.set_shader_parameter("distance_m",distance);terrain.set_shader_parameter("lateral_m",0.0)
	gait.update(distance,0)
	if rotor:rotor.rotation.z=-fposmod(distance*.8,TAU)
	# A restrained dolly, with the machine held to the right of the title.
	camera.position=Vector3(-52+sin(elapsed*.022)*1.8,26.5+sin(elapsed*.017)*.6,-64)
	camera.look_at(Vector3(0,9,0));camera.h_offset=-16
	for item in landmarks:
		var z=fposmod(item.z+distance+240,480)-240
		var ground=MMFDunes.height_at(item.x,z-distance)
		item.node.position=Vector3(item.x,ground-.22,z)-item.node.basis*Vector3(item.center.x,item.base,item.center.z)

func _exit_tree():
	if active and is_instance_valid(game):game.get_viewport().disable_3d=was_disabled

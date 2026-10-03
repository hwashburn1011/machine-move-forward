extends SceneTree

# Fixed native lighting/cameras for reviewing art changes, separate from saves.
var label="before"
var camera: Camera3D
var stage: Node3D
var roster=[]
func _initialize():
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--label="):label=arg.trim_prefix("--label=")
	call_deferred("run")
func capture(name: String,at: Vector3,target: Vector3):
	camera.position=at;camera.look_at(target);camera.reset_physics_interpolation()
	await create_timer(.15).timeout;await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png("res://../test-results/godot-native/character-"+label+"-"+name+".png")
func run():
	DisplayServer.window_set_size(Vector2i(1400,1400));Engine.max_fps=60
	root.msaa_3d=Viewport.MSAA_4X
	stage=Node3D.new();root.add_child(stage)
	var world=WorldEnvironment.new();world.environment=Environment.new()
	world.environment.background_mode=Environment.BG_COLOR;world.environment.background_color=Color(.10,.12,.14)
	world.environment.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR
	world.environment.ambient_light_color=Color(.72,.81,1);world.environment.ambient_light_energy=.65
	world.environment.tonemap_mode=Environment.TONE_MAPPER_FILMIC;stage.add_child(world)
	var key=DirectionalLight3D.new();key.rotation_degrees=Vector3(-35,-35,0);key.light_energy=1.9;key.light_color=Color(1,.90,.78);key.shadow_enabled=true;stage.add_child(key)
	var fill=OmniLight3D.new();fill.position=Vector3(-2,2,-2);fill.omni_range=8;fill.light_energy=2.8;fill.light_color=Color(.64,.79,1);stage.add_child(fill)
	MMFAssets.box(stage,Vector3(30,.1,30),Vector3(0,-.05,0),MMFAssets.material(Color(.17,.18,.19)))
	camera=Camera3D.new();stage.add_child(camera);camera.current=true;camera.fov=32
	for kind in ["s07-player","bastion","revenant","warden","sovereign","raider","scavenger"]:
		var path=MMFEnemyModels.path(kind) if kind!="s07-player" else ("res://art/refined-s07-player.scn" if FileAccess.file_exists("res://art/refined-s07-player.scn") and label!="before" else "res://assets/models/authored/s07-player.glb")
		if label=="before":path="res://art/legacy-"+kind+".scn" if kind in ["raider","scavenger"] else "res://assets/models/authored/"+kind+".glb"
		var visual=MMFAssets.scene(path);stage.add_child(visual)
		var bounds=MMFAssets.bounds(visual);var fit=1.92/float(visual.get_meta("original_fit_height",bounds.size.y))
		visual.scale*=fit;visual.position.y=-bounds.position.y*fit
		if kind!="s07-player":
			var footing=MMFAssets.json("res://tests/fixtures/character-footing-before.json" if label=="before" else "res://data/enemy-footing.json")
			visual.position.y=footing.models[kind].visualY
		if kind=="sovereign":
			var body=MMFAssets.find_named(visual,"sovereign_CombatBody");var mesh=body.mesh
			body.mesh=load("res://tests/fixtures/character-sovereign-body-before.res" if label=="before" else "res://art/sovereign-body.res")
			for i in mesh.get_surface_count():body.set_surface_override_material(i,mesh.surface_get_material(i))
			var mount=MMFAssets.find_named(visual,"EnemyMuzzle").get_parent();var drone=MMFAssets.scene("res://art/sovereign-drone.glb");mount.add_child(drone);drone.rotation.x=PI/2
		var anim=MMFAssets.of_type(visual,"AnimationPlayer")[0]
		anim.callback_mode_process=AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
		for clip in anim.get_animation_list():
			if (kind=="s07-player" and clip.ends_with("unarmed_idle")) or (kind!="s07-player" and clip.to_lower().ends_with("idle")):
				anim.play(clip);anim.advance(0);anim.seek(.3,true);break
		await capture(kind,Vector3(2.15,1.65,4.45),Vector3(0,1,0))
		await capture(kind+"-head",Vector3(.52,1.80,1.40),Vector3(0,1.57,0))
		await capture(kind+"-back",Vector3(-2.1,1.75,-4.6),Vector3(0,1.05,0))
		visual.free()
	stage.free();MMFAssets.cache.clear();quit()

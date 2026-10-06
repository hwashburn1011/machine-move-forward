extends SceneTree

var game
var camera: Camera3D
var report={"views":[],"scope":"Native static composition and close material review; not gameplay or performance acceptance."}
const OUT="res://../test-results/v1-environment-polish-20261005/"
func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://roadside-presentation-review/";call_deferred("run")

func environment_inputs() -> Dictionary:
	var inputs={}
	for path in ["res://scripts/roadside_composition.gd","res://scripts/desert_layout.gd","res://scripts/art100_materials.gd","res://scripts/scenery_chunk.gd","res://art/roadside-wear/manifest.json"]:inputs[path]=FileAccess.get_sha256(path)
	for kind in MMFAssets.json("res://art/roadside-wear/manifest.json").models:
		var path="res://art/roadside-wear/"+kind+".res";inputs[path]=FileAccess.get_sha256(path)
	return inputs

func capture(label: String):
	for i in 12:await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(ProjectSettings.globalize_path(OUT+label+".png"))
	report.views.append(label)

func run():
	if DisplayServer.get_name()=="headless":quit(1);return
	report.source_hash=MMFPlaytestRecorder.source_fingerprint();report.environment_inputs=environment_inputs()
	DisplayServer.window_set_size(Vector2i(1920,1080));Engine.max_fps=60
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	while not game.cinematics.opening_stage.prepared():await process_frame
	game.started=true;game.session.opening_done=true;game.invulnerable=true;game.close_menu()
	game.set_physics_process(false);game.player.set_physics_process(false);game.player.visual.hide();game.ui.root.hide()
	camera=Camera3D.new();game.add_child(camera);camera.fov=65;camera.far=1800;camera.current=true
	camera.physics_interpolation_mode=Node.PHYSICS_INTERPOLATION_MODE_OFF
	var checks=MMFAssets.json(OUT+"checks.json")
	for label in checks.review_samples:
		var sample=checks.review_samples[label];game.session.seed_name=sample.seed;game.session.distance=-float(sample.row)*64;game.session.lateral=0
		game.world.refresh_chunks(true);game.world.update(0)
		var placements=game.world.layout.generate(sample.seed,int(sample.row));var anchor=placements[0]
		camera.position=Vector3(-11,18,25);camera.look_at(Vector3(anchor.x-10,2,anchor.z))
		await capture(label+"-upper-deck")
		camera.position=Vector3(-12,10,18);camera.look_at(Vector3(anchor.x-6,2,anchor.z))
		await capture(label+"-lower-deck")
	# A quiet interval, shown from the same deck height, documents actual spacing.
	for row in range(-40,-1):
		if not MMFRoadsideComposition.quiet("presentation-roadside",row):continue
		game.session.seed_name="presentation-roadside";game.session.distance=-row*64.0;game.world.refresh_chunks(true);game.world.update(0)
		camera.position=Vector3(-11,18,25);camera.look_at(Vector3(-55,1,-40));await capture("quiet-interval");break
	var holder=Node3D.new();game.add_child(holder);holder.position=Vector3(0,120,0)
	game.world.world_environment.environment.fog_enabled=false
	var floor_mat=MMFAssets.material(Color.html("77766f"));MMFAssets.box(holder,Vector3(30,.1,30),Vector3(0,-.06,0),floor_mat,false)
	var original_kit=load("res://art/art200-wasteland.glb").instantiate()
	var manifest=MMFAssets.json("res://art/roadside-wear/manifest.json")
	for kind in manifest.models:
		var original=MMFAssets.find_named(original_kit,kind);var part=original.duplicate();holder.add_child(part)
		var b: AABB=part.get_aabb();var focus=holder.position+b.get_center();var radius=maxf(b.size.x,b.size.y)
		camera.position=focus+Vector3(.7,.38,1.1)*radius;camera.look_at(focus)
		for i in part.mesh.get_surface_count():
			var mat=part.mesh.surface_get_material(i)
			if String(mat.resource_name)=="ART200 Wasteland / steel":mat.roughness=.54;mat.metallic=.7
			elif String(mat.resource_name)=="ART200 Wasteland / aged aluminium":mat.roughness=.42;mat.metallic=.74
		await capture(kind+"-before")
		var load_start=Time.get_ticks_usec();MMFArt100Materials.prepare(part)
		report[kind+"_prepare_ms"]=(Time.get_ticks_usec()-load_start)/1000.0
		await capture(kind+"-after")
		# Approach-distance detail, identically framed before/after; wide frames
		# alone can hide localized wear on fittings only a few pixels across.
		var detail=Vector3(-.9,.64,.35) if kind=="art200-rail-water-crane" else Vector3(1.45,1.8,.3) if kind=="art200-cinder-auto-lift" else Vector3(1.65,1.8,-.5)
		camera.position=holder.position+detail+Vector3(1.4,.5,2.3);camera.look_at(holder.position+detail)
		await capture(kind+"-detail-after")
		part.mesh=original.mesh
		await capture(kind+"-detail-before")
		part.free()
	original_kit.free();holder.free()
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	game.queue_free();while is_instance_valid(game):await process_frame
	await drain.finish(self,refs);MMFAssets.cache.clear()
	report.source_hash_end=MMFPlaytestRecorder.source_fingerprint()
	report.environment_inputs_stable=report.environment_inputs==environment_inputs()
	report.passed=report.environment_inputs_stable and report.views.size()==25
	var file=FileAccess.open(OUT+"review.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"))
	call_deferred("quit")

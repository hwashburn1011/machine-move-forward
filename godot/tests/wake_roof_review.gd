extends SceneTree
## Isolated live Wake, native Forward+ lighting, same shallow views before/after.
var label="roof-before"
var out="res://../test-results/roof-floor/wake/"
var camera: Camera3D
var records=[]
func _initialize():
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--label="):label=arg.trim_prefix("--label=")
	call_deferred("run")

func capture(id: String,at: Vector3,target: Vector3,pan: Vector3):
	var dir=out+label+"/"+id+"/"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir))
	camera.position=at;camera.look_at(target)
	for i in 10:await process_frame
	for frame in 32:
		var shift=pan*(float(frame)/31-.5)
		camera.position=at+shift;camera.look_at(target+shift*.3)
		await RenderingServer.frame_post_draw
		var image=root.get_texture().get_image()
		image.save_jpg(dir+"frame-%04d.jpg"%frame,.98)
		if frame==16:image.save_png(out+label+"/"+id+".png")
	records.append({"id":id,"at":MMFAssets.dict_v(at),"target":MMFAssets.dict_v(target),"pan":MMFAssets.dict_v(pan),"frames":32})

func run():
	if DisplayServer.get_name()=="headless":quit(1);return
	DisplayServer.window_set_size(Vector2i(1280,720));root.msaa_3d=Viewport.MSAA_4X;Engine.max_fps=60
	var scene=Node3D.new();root.add_child(scene)
	var wreck=MMFAssets.scene("models/authored/expedition-wreck.glb");scene.add_child(wreck)
	var env=WorldEnvironment.new();env.environment=Environment.new();scene.add_child(env)
	env.environment.background_mode=Environment.BG_COLOR;env.environment.background_color=Color(.34,.31,.26)
	env.environment.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR;env.environment.ambient_light_color=Color(.78,.82,.87);env.environment.ambient_light_energy=.65
	env.environment.tonemap_mode=Environment.TONE_MAPPER_FILMIC
	var sun=DirectionalLight3D.new();scene.add_child(sun);sun.rotation_degrees=Vector3(-48,-32,0);sun.light_color=Color(1,.87,.69);sun.light_energy=1.8;sun.shadow_enabled=true
	camera=Camera3D.new();scene.add_child(camera);camera.fov=55;camera.near=.08;camera.far=100;camera.make_current()
	await capture("shallow-top",Vector3(1.2,4.05,-10.1),Vector3(1.4,3.6,-6.5),Vector3(1.2,.05,0))
	await capture("lap-underside",Vector3(.7,3.10,-4.35),Vector3(.7,3.6,-6.6),Vector3(1.1,0,0))
	await capture("roof-context",Vector3(10,8,-13),Vector3(0,2.4,-2),Vector3(.4,0,0))
	var file=FileAccess.open(out+label+"/capture.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"sourceSha256":FileAccess.get_sha256("res://assets/models/authored/expedition-wreck.glb"),"renderer":RenderingServer.get_video_adapter_name(),"records":records,"note":"Isolated shipping Wake source with unchanged imported materials. Same real native lights, camera paths, LOD and shadows. Not a gameplay performance test."},"\t"));file.close()
	scene.queue_free();await process_frame;MMFAssets.cache.clear();await process_frame
	print("WAKE_ROOF_REVIEW_COMPLETE ",label);quit(0)

extends SceneTree

# Frozen allocation path from a124e43, to compare with the reusable render batches.
class LegacyEffects extends Node3D:
	var objects=[]
	var sphere=SphereMesh.new()
	func _init(): sphere.radius=.05;sphere.height=.1
	func particle(at: Vector3,velocity: Vector3,color: Color,size: float,life: float):
		var node=MeshInstance3D.new();node.mesh=sphere;node.scale=Vector3.ONE*size/.05
		node.material_override=MMFAssets.material(color,2);node.position=at;add_child(node)
		objects.append({"node":node,"remaining":life,"life":life,"velocity":velocity,"grow":0.0})
	func tracer(a: Vector3,b: Vector3,color: Color):
		var mesh=ImmediateMesh.new();mesh.surface_begin(Mesh.PRIMITIVE_LINES);mesh.surface_add_vertex(a);mesh.surface_add_vertex(b);mesh.surface_end()
		var node=MeshInstance3D.new();node.mesh=mesh;node.material_override=MMFAssets.material(color,3);add_child(node)
		objects.append({"node":node,"remaining":.075,"life":.075,"velocity":Vector3.ZERO,"grow":0.0})
	func update(dt: float):
		for i in range(objects.size()-1,-1,-1):
			var p=objects[i];p.remaining-=dt
			if p.remaining<=0:p.node.queue_free();objects.remove_at(i);continue
			p.node.position+=p.velocity*dt;p.node.transparency=1-p.remaining/p.life;p.node.scale+=Vector3.ONE*p.grow*dt

func _initialize():call_deferred("run")

func median(values: Array):
	values.sort();return values[values.size()/2]

func run():
	if DisplayServer.get_name()=="headless":push_error("Requires GPU");quit(1);return
	DisplayServer.window_set_size(Vector2i(1920,1080));DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	var camera=Camera3D.new();root.add_child(camera);camera.position=Vector3(2.2,1.5,6);camera.look_at(Vector3(2.2,1.5,0));camera.current=true
	var report={"adapter":RenderingServer.get_video_adapter_name(),"resolution":str(root.size),"effects":1500,"trials":5,"baseline":"a124e43 tracer/particle/update path"}
	for mode in ["legacy","batched"]:
		var creation=[];var first_update=[];var frame_times=[];var draws=[];var new_nodes=[]
		for trial in 5:
			var effects=LegacyEffects.new() if mode=="legacy" else MMFEffects.new();root.add_child(effects)
			for i in 5:await process_frame
			var start_nodes=effects.get_child_count();var start=Time.get_ticks_usec()
			for i in 750:
				var at=Vector3((i%30)*.15,(i/30)*.12,0)
				effects.particle(at,Vector3.ZERO,Color(1,.6,.2),.04,.5)
				effects.tracer(at,at+Vector3(.045,.06,-.1),Color(1,.6,.2))
			creation.append((Time.get_ticks_usec()-start)/1000.0);start=Time.get_ticks_usec();effects.update(.025)
			first_update.append((Time.get_ticks_usec()-start)/1000.0);new_nodes.append(effects.get_child_count()-start_nodes)
			# Freeze effect lifetime: identical visible workload, allowing GPU warmup.
			for i in 20:await process_frame
			var previous=Time.get_ticks_usec()
			for i in 120:
				await process_frame;var now=Time.get_ticks_usec();frame_times.append((now-previous)/1000.0);previous=now
				draws.append(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
			if trial==0:
				await RenderingServer.frame_post_draw;root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../test-results/godot-native/effect-"+mode+".png"))
			effects.queue_free();for i in 5:await process_frame
		report[mode]={"enqueueMedianMs":median(creation),"firstUpdateMedianMs":median(first_update),"renderFrameMedianMs":median(frame_times),"drawCallsMedian":median(draws),"newSceneNodes":median(new_nodes)}
		print("EFFECT_BENCHMARK ",mode," ",report[mode])
	var file=FileAccess.open("res://../test-results/godot-native/effect-benchmark.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	camera.queue_free();await process_frame;quit()

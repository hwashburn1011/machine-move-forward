extends SceneTree

var game
var checks=0
var failures=[]
var notices=[]

func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-desert-tests/";call_deferred("run")
func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func signature(node: Node3D) -> String:
	var entries=[]
	for batch in node.get_child(0).get_children():
		if batch.has_meta("ground_sites"):entries.append([batch.name,batch.get_meta("ground_sites")])
	return str(entries)

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false)
	var s=game.session
	s.opening_done=true;s.scanner.phase="consumed";s.story.phase="locked"
	var levels=[]
	for intensity in [0.0,.5,1.0]:
		for indoors in [false,true]:
			s.weather.intensity=intensity;s.sheltered=indoors;s.hydration=100
			s.tick(10);levels.append(s.hydration)
	check(levels.all(func(n):return is_equal_approx(n,100-10*float(game.data.HYDRATION_DRAIN_PER_S))),"Clear, storm and sheltered weather all consume exactly the base water rate")
	s.hydration=.001;s.weather.intensity=1;s.tick(10)
	check(s.hydration==0,"Base water consumption remains clamped at zero")
	s.weather={"phase":"front","elapsed":23.0,"next":600.0,"intensity":1.0,"sequence":2};s.hydration=77
	var snapshot=s.native_snapshot();var restored=MMFSession.new(game.data)
	check(restored.restore_native(snapshot) and restored.weather==s.weather and restored.hydration==77,"Existing mid-storm saves retain weather and hydration without migration")
	restored.tick(10)
	check(is_equal_approx(restored.hydration,77-10*float(game.data.HYDRATION_DRAIN_PER_S)),"Restored exposed storm save also uses the normal water rate")
	s.notice.connect(func(message):notices.append(message))
	s.weather={"phase":"clear","elapsed":0.0,"next":0.0,"intensity":0.0,"sequence":0}
	game.home.update_weather(.1)
	check(s.weather.phase=="forecast" and notices.back().contains("Visibility") and not notices.back().to_lower().contains("water"),"Forecast explains reduced visibility without telling players to shelter for water")
	game.home.update_weather(35);game.home.update_weather(10);game.world.update(0)
	check(s.weather.phase=="front" and s.weather.intensity==1 and is_equal_approx(game.world.world_environment.environment.fog_density,.0198),"Storm still reaches its existing full visibility reduction")
	game.home.update_weather(60);game.home.update_weather(20);game.world.update(0)
	check(s.weather.phase=="clear" and s.weather.intensity==0 and s.weather.next>s.distance,"Storm clears and schedules its next normal front")
	var life=game.world.atmosphere.desert_life
	check(life.sources.size()==7 and life.sources.values().all(func(n):return n is MeshInstance3D),"All seven Blender assemblies load as native meshes")
	check(life.stone_material.vertex_color_use_as_albedo and not life.stone_material.vertex_color_is_srgb,"Scoured stones use their authored linear vertex colours")
	var pinned=true;var flexible=true;var triangle_count=0
	for kind in life.KINDS:
		var arrays=life.sources[kind].mesh.surface_get_arrays(0)
		check(arrays[Mesh.ARRAY_COLOR]!=null and arrays[Mesh.ARRAY_COLOR][0].r<.6,kind+" retains weathered colour data")
		triangle_count+=arrays[Mesh.ARRAY_INDEX].size()/3
		if kind in ["DryBrushA","DryBrushB","WindTuft"]:
			var uvs=arrays[Mesh.ARRAY_TEX_UV];var points=arrays[Mesh.ARRAY_VERTEX]
			for i in points.size():
				if points[i].y<.08:pinned=pinned and is_equal_approx(uvs[i].y,1)
			flexible=flexible and Array(uvs).any(func(uv):return uv.y<.9)
	check(pinned and flexible,"Brush exports fixed roots and flexible tips for restrained wind")
	check(triangle_count<30000,"Seven-model geometry stays within its 30,000-triangle source budget")
	var a=Node3D.new();var b=Node3D.new()
	life.place(a,"desert-test",-12,0,[]);life.place(b,"desert-test",-12,0,[])
	check(signature(a)==signature(b),"Natural detail placement and wind phases repeat for the same seed")
	b.free();b=Node3D.new();life.place(b,"another-desert-test",-12,0,[])
	check(signature(a)!=signature(b),"Another campaign seed changes natural detail clusters")
	a.free();b.free()
	var lane=true;var grounding=true;var density=true;var materials=true;var drift=true;var count=0
	for band in [-2,-1,0,1,2]:
		for row in [-700,-12,0,28]:
			var chunk=Node3D.new();life.place(chunk,"grounding-audit",row,band,[]);var local_count=0
			for batch in chunk.get_child(0).get_children():
				if batch.has_meta("ground_sites"):
					materials=materials and batch.material_override!=null
					for entry in batch.get_meta("ground_sites"):
						var at=entry[0].origin;var world_x=at.x+band*256;var world_z=at.z+row*64
						lane=lane and (world_x<=-17 or world_x>=42)
						grounding=grounding and absf(at.y-MMFDunes.height_at(world_x,world_z)+.045)<.002
						local_count+=1
				else:
					for vertex in batch.mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]:drift=drift and absf(vertex.y-MMFDunes.height_at(vertex.x,vertex.z+row*64)-.16)<.002
			density=density and local_count<=(20 if band==0 else 10);count+=local_count;chunk.free()
	check(lane,"Natural details preserve the machine corridor and docking lane in every sampled band")
	check(grounding,"All sampled root origins fit actual dune height, including distant and negative coordinates")
	check(drift,"Every airborne sand sheet vertex follows the dune 16 cm above its surface")
	check(density and count>0,"Detail counts stay sparse and bounded across 20 sampled chunks")
	check(materials,"Every rendered detail batch has an explicit authored material")
	var blocked=Node3D.new();life.place(blocked,"grounding-audit",0,0,[AABB(Vector3(-300,-100,-100),Vector3(600,200,200))])
	check(blocked.get_child(0).get_child_count()==0,"Occupied scenery leaves no overlapping brush, stones or drifting-sand patch")
	blocked.free()
	life.update(1.8)
	check(is_equal_approx(life.brush_material.get_shader_parameter("wind_strength"),1.8) and is_equal_approx(life.drift_material.get_shader_parameter("wind_strength"),1.8),"Storm wind reaches both brush and sand without per-instance processing")
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"triangles":triangle_count,"sampledProps":count}
	var file=FileAccess.open("res://../test-results/godot-native/desert-life-tests.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	game.queue_free();while is_instance_valid(game):await process_frame
	life=null;s=null;restored=null;await create_timer(.1).timeout;MMFAssets.cache.clear();quit(0 if failures.is_empty() else 1)

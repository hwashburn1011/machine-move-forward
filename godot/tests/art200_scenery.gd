extends SceneTree

var checks=0
var failures=[]
var report={"models":{},"route":{}}

class CollisionWorld extends Node3D:
	var game={}
	var chunks={}

class HeldCollision extends MMFSceneryCollision:
	# Hold the observable status while retaining a real accepted engine request.
	# This deterministically verifies the in-progress branch even on fast SSDs.
	var hold=false
	func loading_status() -> int:
		return ResourceLoader.THREAD_LOAD_IN_PROGRESS if hold else super.loading_status()

func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://art200-scenery/";call_deferred("run")
func check(ok: bool,label: String):
	checks+=1
	if not ok:failures.append(label);push_error(label)

func digest(bytes: PackedByteArray) -> String:
	var context=HashingContext.new();context.start(HashingContext.HASH_SHA256);context.update(bytes)
	return context.finish().hex_encode()

func load_chunks(manager,kind: String) -> Array:
	var result=[]
	for chunk in manager.chunks_for(kind):result.append(load(chunk.path))
	return result

func collision_chunks(part: MeshInstance3D) -> int:
	var body=part.get_node_or_null("LandmarkCollision")
	return body.get_child_count() if body else 0

func verify_baked_faces(world):
	var manifest=MMFAssets.json(MMFSceneryCollision.BAKED_MANIFEST)
	var names=world.prototypes.keys();names.sort();var baked_names=manifest.models.keys();baked_names.sort()
	check(names.size()==125 and names==baked_names,"Exact bake covers all 125 final overridden world prototypes")
	check(manifest.sources_sha256.size()==5,"Collision provenance includes original library plus four overriding collections")
	check(int(manifest.format)==2 and int(manifest.triangles_per_chunk)==2048,"Native collision uses bounded exact 2048-triangle chunks")
	for source in manifest.sources_sha256:
		check(FileAccess.get_sha256(source)==manifest.sources_sha256[source],source+": collision source hash is current")
	var triangles=0;var bytes=0;var chunk_count=0
	for kind in names:
		if not manifest.models.has(kind):continue
		var entry=manifest.models[kind];var joined=PackedVector3Array();var model_bytes=0;var index=0
		for chunk in entry.chunks:
			var shape=ResourceLoader.load(chunk.path,"ConcavePolygonShape3D",ResourceLoader.CACHE_MODE_IGNORE)
			check(shape is ConcavePolygonShape3D,kind+": native chunk loads "+str(index))
			if not shape is ConcavePolygonShape3D:continue
			var faces=shape.get_faces()
			check(faces.size()>0 and faces.size()%3==0 and faces.size()<=2048*3,kind+": chunk stays within bounded triangle count")
			check(int(chunk.first_triangle)==joined.size()/3 and int(chunk.triangles)==faces.size()/3,kind+": chunks are consecutive with no missing or duplicate ranges")
			check(shape.backface_collision,kind+": every chunk remains double-sided")
			check(FileAccess.get_sha256(chunk.path)==chunk.shape_sha256,kind+": compressed chunk resource hash matches manifest")
			check(digest(faces.to_byte_array())==chunk.faces_sha256,kind+": ordered chunk face hash matches manifest")
			check(entry.source_sha256==manifest.sources_sha256.get(entry.source,"") and shape.get_meta("source_sha256","")==entry.source_sha256,kind+": source provenance matches chunk")
			check(shape.get_meta("landmark_kind","")==kind and int(shape.get_meta("chunk_index",-1))==index and shape.get_meta("faces_sha256","")==chunk.faces_sha256,kind+": chunk identity and order metadata match")
			joined.append_array(faces);model_bytes+=int(chunk.bytes);index+=1;chunk_count+=1
		var mesh_faces: PackedVector3Array=world.prototypes[kind].mesh.get_faces()
		check(joined.to_byte_array()==mesh_faces.to_byte_array(),kind+": concatenated chunks retain every original face byte in exact order")
		check(digest(joined.to_byte_array())==entry.faces_sha256,kind+": complete model face hash matches manifest")
		check(int(entry.triangles)==joined.size()/3 and model_bytes==int(entry.bytes),kind+": complete collision counts and sizes match")
		triangles+=joined.size()/3;bytes+=model_bytes
	check(triangles==int(manifest.total_triangles),"Total exact collision triangle count matches all source prototypes")
	check(bytes==int(manifest.total_bytes) and chunk_count==int(manifest.total_chunks),"Compressed collision size and chunk count match manifest")
	report.baked_collision={"models":names.size(),"chunks":chunk_count,"triangles_per_chunk":2048,"triangles":triangles,"compressed_bytes":bytes,"manifest_sha256":FileAccess.get_sha256(MMFSceneryCollision.BAKED_MANIFEST),"sources_sha256":manifest.sources_sha256}

func verify_collision_lifecycle(world):
	var fixture=CollisionWorld.new();fixture.position=Vector3(0,2000,0);root.add_child(fixture)
	var player=Node3D.new();fixture.add_child(player);fixture.game={"player":player}
	var chunk=Node3D.new();fixture.add_child(chunk);fixture.chunks={Vector2i.ZERO:chunk}
	var manager=MMFSceneryCollision.new();manager.setup(fixture)
	var names=world.prototypes.keys();names.sort();var parts=[]
	for i in 3:
		var part=world.prototypes[names[i]].duplicate();part.set_meta("landmark_kind",names[i]);part.position.x=20+i*12
		part.rotation.y=.43;part.scale=Vector3.ONE*1.23;chunk.add_child(part);parts.append(part)
		manager.cache_shape(names[i],load_chunks(manager,names[i]))
	manager.update(.25)
	check(parts.reduce(func(total,p):return total+collision_chunks(p),0)==1,"First ordinary update activates only one native triangle chunk")
	manager.update(0)
	check(parts.reduce(func(total,p):return total+collision_chunks(p),0)==2,"Next ordinary update activates exactly one more chunk")
	for _i in 100:manager.update(0)
	check(parts.all(func(p):return manager.is_complete(p)),"Successive ticks complete every cached compound landmark")
	var body=parts[0].get_node("LandmarkCollision");var collider=body.get_child(0)
	var first_shape=weakref(collider.shape);var first_id=collider.shape.get_instance_id()
	check(body.collision_layer==1 and body.collision_mask==0,"Compound landmark bodies retain scenery collision layers")
	check(body.transform.is_equal_approx(Transform3D.IDENTITY) and body.get_children().all(func(c):return c.global_transform.is_equal_approx(parts[0].global_transform)),"Every chunk follows rotated and scaled landmark exactly")
	check(collider.shape.resource_path==manager.chunks_for(names[0])[0].path,"Ordinary activation uses the first pre-baked native chunk")
	check(collision_chunks(parts[0])==manager.chunks_for(names[0]).size(),"Completed compound body includes all expected chunks")
	manager.attach(parts[0])
	check(parts[0].get_child_count()==1,"Repeated attachment preserves one compound body root")
	player.position.x=500;manager.update(.25);await process_frame
	check(parts.all(func(p):return not p.has_node("LandmarkCollision")),"Leaving range releases every nearby physics body")
	check(first_shape.get_ref()!=null and manager.shapes.size()==3,"Far removal retains complete reusable cached assemblies")
	player.position=Vector3.ZERO;manager.update(.25)
	check(parts[0].get_node("LandmarkCollision").get_child(0).shape.get_instance_id()==first_id,"Returning near reuses exact cached chunk resources")
	for i in range(3,34):
		var part=world.prototypes[names[i]].duplicate();part.set_meta("landmark_kind",names[i]);part.position.x=20+i*12
		chunk.add_child(part);parts.append(part);manager.attach(part)
	check(manager.shapes.size()==32 and manager.order.size()==32,"More prototypes preserve the 32-complete-assembly cache limit")
	check(not manager.shapes.has(names[0]) and first_shape.get_ref()!=null,"Evicted cache ownership does not remove active body collision")
	var returning=world.prototypes[names[0]].duplicate();returning.set_meta("landmark_kind",names[0]);chunk.add_child(returning);manager.attach(returning)
	check(returning.get_child(0).get_child(0).shape.resource_path==manager.chunks_for(names[0])[0].path,"Evicted prototype returns through exact native chunk loading")
	check(manager.shapes.size()==32 and manager.order.size()==32,"Repeated near and eviction do not grow the complete-assembly cache")
	var future=MeshInstance3D.new();future.mesh=BoxMesh.new();future.set_meta("landmark_kind","test-unbaked-future-prototype");chunk.add_child(future);manager.attach(future)
	var fallback: ConcavePolygonShape3D=future.get_child(0).get_child(0).shape
	check(fallback.resource_path=="" and fallback.get_faces()==future.mesh.get_faces() and fallback.backface_collision,"Unbaked future prototype retains exact double-sided fallback")
	manager.pending.clear();manager.pending.append(weakref(future));future.free();manager.update(0)
	# Existing bounded activation finishes before the queued dead candidate is
	# visited. No dead reference may survive that eventual queue drain.
	for _i in 100:manager.update(0)
	check(manager.pending.is_empty(),"Released queued landmark references are skipped safely")
	fallback=null;body=null;collider=null;parts.clear();fixture.free();manager.clear()
	await physics_frame;await process_frame
	check(manager.world==null and manager.pending.is_empty() and manager.shapes.is_empty() and manager.order.is_empty() and manager.working_shapes.is_empty() and manager.baked_models.is_empty(),"Compound shutdown releases complete and partial caches, pending nodes and world")
	check(first_shape.get_ref()==null,"Loader retains no chunk after all cache and body owners release it")

func verify_async_collision(world):
	var fixture=CollisionWorld.new();fixture.position=Vector3(0,2500,0);root.add_child(fixture)
	var player=Node3D.new();fixture.add_child(player);fixture.game={"player":player}
	var chunk=Node3D.new();fixture.add_child(chunk);fixture.chunks={Vector2i.ZERO:chunk}
	var manager=HeldCollision.new();manager.setup(fixture);manager.hold=true
	var slow=world.prototypes["wreck-ambulance"].duplicate();slow.set_meta("landmark_kind","wreck-ambulance");slow.position.x=40;chunk.add_child(slow)
	manager.update(.25)
	check(manager.requests_started==1 and manager.requests_collected==0 and manager.loading_kind=="wreck-ambulance" and manager.loading_index==0,"Proximity owns one asynchronous request for the first bounded chunk")
	for _i in 5:manager.update(0)
	check(manager.requests_started==1 and manager.requests_collected==0 and not slow.has_node("LandmarkCollision"),"Normal updates never join or duplicate an in-progress chunk request")
	manager.hold=false;var deadline=Time.get_ticks_usec()+5000000
	while manager.requests_collected<1 and Time.get_ticks_usec()<deadline:
		await physics_frame;manager.update(0)
	check(manager.requests_collected==1 and collision_chunks(slow)==1 and not manager.is_complete(slow),"One completed load activates exactly its one chunk")
	check(not manager.shapes.has("wreck-ambulance") and manager.working_shapes.size()==1,"Partial assemblies do not occupy the complete-kind cache")
	check(slow.get_child(0).get_child(0).shape.get_meta("faces_sha256","")==manager.chunks_for("wreck-ambulance")[0].faces_sha256,"Worker-loaded first chunk preserves its exact face values")
	manager.hold=true;manager.update(0)
	check(manager.requests_started==2 and manager.loading_index==1,"Next tick requests only the next consecutive chunk")
	slow.position.x=300;manager.update(.25);await process_frame
	check(not slow.has_node("LandmarkCollision") and manager.requests_collected==1,"Moving far releases partial body without waiting for in-progress loading")
	manager.hold=false;deadline=Time.get_ticks_usec()+5000000
	while manager.loading_path!="" and Time.get_ticks_usec()<deadline:
		await physics_frame;manager.update(0)
	check(not slow.has_node("LandmarkCollision") and manager.working_shapes.is_empty() and not manager.shapes.has("wreck-ambulance"),"Far completed requests release their incomplete assembly without stale activation")
	slow.position.x=40;manager.update(.25);deadline=Time.get_ticks_usec()+7000000
	var bounded=true
	while not manager.is_complete(slow) and Time.get_ticks_usec()<deadline:
		var requested=manager.requests_started;var collected=manager.requests_collected;var installed=collision_chunks(slow)
		await physics_frame;manager.update(1.0/60.0)
		bounded=bounded and (manager.requests_started-requested)+(manager.requests_collected-collected)<=1 and collision_chunks(slow)-installed<=1
	check(bounded,"Every ordinary tick requests, collects and activates at most one chunk")
	check(manager.is_complete(slow) and collision_chunks(slow)==manager.chunks_for("wreck-ambulance").size(),"Staged native loading eventually completes every collision chunk")
	check(manager.shapes.has("wreck-ambulance") and manager.shapes["wreck-ambulance"].size()==manager.chunks_for("wreck-ambulance").size(),"Only complete assemblies enter the bounded kind cache")
	var near=world.prototypes["wreck-forklift"].duplicate();near.set_meta("landmark_kind","wreck-forklift");near.position.x=20;chunk.add_child(near)
	var farther=world.prototypes["wreck-pickup"].duplicate();farther.set_meta("landmark_kind","wreck-pickup");farther.position.x=60;chunk.add_child(farther)
	manager.hold=true;manager.update(.25)
	check(manager.loading_kind=="wreck-forklift","New assembly work prioritizes the closest unfinished landmark")
	near.free();manager.clear()
	check(manager.requests_collected==manager.requests_started and manager.loading_path=="" and manager.loading_index==-1,"Teardown drains exactly one owned chunk request after its landmark disappears")
	var drained=manager.requests_collected;manager.clear()
	check(manager.requests_collected==drained,"Repeated teardown never consumes an engine request twice")
	check(manager.shapes.is_empty() and manager.working_shapes.is_empty() and manager.pending.is_empty() and manager.world==null,"Asynchronous shutdown clears complete and partial assemblies")
	fixture.free();await physics_frame
	var direct=MMFSceneryCollision.new();direct.setup(world)
	var part=world.prototypes["wreck-ambulance"].duplicate();part.set_meta("landmark_kind","wreck-ambulance");direct.begin_part(part)
	check(direct.request_shape("wreck-ambulance"),"Explicit immediate fixture owns its first chunk request")
	direct.attach(part)
	check(direct.is_complete(part) and direct.requests_started==direct.requests_collected and direct.loading_path=="","Immediate attachment joins its owned request and completes all exact chunks")
	part.free();direct.clear()
	# Teleport safety is explicitly permitted to finish the nearby compound in
	# one blocking call, unlike ordinary preparation at 72 m.
	var urgent_world=CollisionWorld.new();urgent_world.position=Vector3(0,3000,0);root.add_child(urgent_world)
	var urgent_player=Node3D.new();urgent_world.add_child(urgent_player);urgent_world.game={"player":urgent_player}
	var urgent_chunk=Node3D.new();urgent_world.add_child(urgent_chunk);urgent_world.chunks={Vector2i.ZERO:urgent_chunk}
	var urgent_part=world.prototypes["wreck-ambulance"].duplicate();urgent_part.set_meta("landmark_kind","wreck-ambulance");urgent_part.position.x=40;urgent_chunk.add_child(urgent_part)
	var urgent=HeldCollision.new();urgent.setup(urgent_world);urgent.hold=true;urgent.update(.25)
	urgent_player.position.x=40;urgent.update(0)
	check(urgent.is_complete(urgent_part) and collision_chunks(urgent_part)==urgent.chunks_for("wreck-ambulance").size(),"Teleport within three metres immediately completes every solid collision chunk")
	check(urgent.requests_started==urgent.requests_collected and urgent.loading_path=="","Urgent completion consumes the owned request once")
	urgent_world.free();urgent.clear()

func run():
	var game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false)
	var world=game.world;var total=0;var refs=[]
	verify_baked_faces(world)
	await verify_collision_lifecycle(world)
	await verify_async_collision(world)
	var holder=Node3D.new();root.add_child(holder);holder.position=Vector3(0,100,0)
	check(MMFArt200Scenery.SPECS.size()==50,"Exactly fifty new complete scenery assemblies")
	for spec in MMFArt200Scenery.SPECS:
		var id=String(spec[0]);var source=world.prototypes.get(id)
		check(source is MeshInstance3D,id+": native prototype registered")
		if not source:continue
		var mesh: Mesh=source.mesh;var bounds=mesh.get_aabb();var triangles=0
		for surface in mesh.get_surface_count():
			var arrays=mesh.surface_get_arrays(surface)
			triangles+=(arrays[Mesh.ARRAY_INDEX].size() if arrays[Mesh.ARRAY_INDEX]!=null and not arrays[Mesh.ARRAY_INDEX].is_empty() else arrays[Mesh.ARRAY_VERTEX].size())/3
		total+=triangles;refs.append(weakref(source))
		check(absf(bounds.position.y)<.008,id+": base sits on the authored ground plane")
		check(absf(maxf(bounds.size.x,bounds.size.z)-float(spec[1]))<.01,id+": placement uses true exported footprint")
		check(source.transform.is_equal_approx(Transform3D.IDENTITY),id+": instance transform remains identity")
		check(triangles>250 and triangles<=22000,id+": bounded detail budget")
		check(mesh.get_surface_count()<=7,id+": material batches remain bounded")
		var part=source.duplicate();part.set_meta("landmark_kind",id);holder.add_child(part)
		world.scenery_collision.attach(part)
		await physics_frame;await physics_frame
		var faces=mesh.get_faces();var largest=-1.0;var center=Vector3.ZERO;var normal=Vector3.ZERO
		for i in range(0,faces.size(),3):
			var cross=(faces[i+1]-faces[i]).cross(faces[i+2]-faces[i])
			if cross.length_squared()>largest:
				largest=cross.length_squared();normal=cross.normalized();center=(faces[i]+faces[i+1]+faces[i+2])/3
		var from=part.to_global(center+normal*.12);var to=part.to_global(center-normal*.12)
		var hit=holder.get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(from,to,1))
		check(not hit.is_empty() and hit.collider.get_meta("landmark_kind","")==id,id+": real surface blocks an actual physics ray")
		if id=="art200-billboard-morrow-motors":
			var gap=holder.get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(part.to_global(Vector3(0,2,-4)),part.to_global(Vector3(0,2,4)),1))
			check(gap.is_empty(),"Twin billboard legs preserve the open space between supports")
		report.models[id]={"triangles":triangles,"surfaces":mesh.get_surface_count(),"bounds":str(bounds)}
		part.free()
	check(total<450000,"Fifty new scenery assemblies stay below the combined 450k triangle budget")
	check(world.scenery_collision.shapes.size()<=32,"Scenery physics retains at most thirty-two cached shapes")
	holder.free()
	game.session.seed_name="art200-all-scenery-route"
	var random=game.session.rng.state;var seen={};var lanes=true;var density=true;var signs=true;var maximum=0
	for row in range(-240,0):
		var builder=MMFSceneryChunk.new(world,Vector2i(row,0));var chunk=builder.finish();var count=0;var advertisements=0
		for child in chunk.get_children():
			if not child.has_meta("landmark_kind"):continue
			var id=String(child.get_meta("landmark_kind"));seen[id]=true;count+=1
			if MMFArt200Scenery.is_billboard(id):advertisements+=1
			var bounds=child.transform*child.get_aabb()
			lanes=lanes and (bounds.end.x<=-14 or bounds.position.x>=48)
		maximum=maxi(maximum,count);density=density and count>=1 and count<=11;signs=signs and advertisements<=1
		chunk.free();builder=null
	for spec in MMFArt200Scenery.SPECS:check(seen.has(spec[0]),spec[0]+": appears in actual streamed route")
	check(lanes,"All transformed model bounds clear travel and docking corridors")
	check(density,"Quiet stretches retain one silhouette; populated chunks remain within eleven landmarks")
	check(signs,"Roadside advertising is limited to one complete sign per chunk")
	check(game.session.rng.state==random,"Scenery keeps gameplay RNG unchanged")
	report.route={"chunks":240,"unique_models":seen.size(),"maximum_landmarks":maximum,"lanes_clear":lanes};report.total_triangles=total
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var audio_refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	check(refs.all(func(w):return w.get_ref()==null),"World shutdown releases all new prototype owners")
	MMFAssets.cache.clear();MMFArt100Decor.clear_cache();MMFArt200Decor.clear_cache()
	for frame in 3:await process_frame
	await drain.finish(self,audio_refs)
	report.checks=checks;report.failures=failures;report.passed=failures.is_empty()
	var file=FileAccess.open("res://../test-results/godot-native/art200-scenery.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("ART200_SCENERY ",checks," checks; failures=",failures)
	# Return this coroutine before engine shutdown so its last mesh/shape locals
	# and the threaded preview resources can release their renderer handles.
	call_deferred("quit",0 if failures.is_empty() else 1)

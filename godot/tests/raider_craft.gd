extends SceneTree
var game
var checks=0
var failures=[]
var observations={}
func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-raider-craft-tests/";call_deferred("run")
func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)
func frames(n=3):
	for i in n:await physics_frame
func geometry():
	for kind in ["skiff","gunboat"]:
		var node=MMFRaiderCraft.model(kind);game.add_child(node);node.position=Vector3(60,6,0)
		var triangles=0;var collapsed=0;var surfaces=0;var pbr=0;var meshes=MMFAssets.of_type(node,"MeshInstance3D")
		var body=StaticBody3D.new();body.collision_layer=128;node.add_child(body)
		for item in meshes:
			for s in item.mesh.get_surface_count():
				surfaces+=1;var data=item.mesh.surface_get_arrays(s);var vertices=data[Mesh.ARRAY_VERTEX];var indices=data[Mesh.ARRAY_INDEX]
				var mat=item.mesh.surface_get_material(s)
				if mat is BaseMaterial3D and mat.albedo_texture and mat.normal_enabled and mat.normal_texture:pbr+=1
				for i in range(0,indices.size(),3):
					triangles+=1
					if (vertices[indices[i+1]]-vertices[indices[i]]).cross(vertices[indices[i+2]]-vertices[indices[i]]).length_squared()<1e-24:collapsed+=1
			var shape=CollisionShape3D.new();shape.shape=item.mesh.create_trimesh_shape();body.add_child(shape);shape.global_transform=item.global_transform
		check(triangles>40000 and triangles<65000 and collapsed==0,kind+": refined geometry retains valid triangles within budget")
		check(meshes.size()<=6 and surfaces<=24 and pbr>=3,kind+": original worn PBR surfaces remain batched")
		check(MMFAssets.of_type(node,"Light3D").is_empty(),kind+": model adds no realtime lights")
		var bounds=MMFAssets.bounds(node)
		check(bounds.size.x<3.45 and bounds.position.y>=0 and bounds.end.z<4.51 and bounds.position.z>=-4.51,kind+": hull retains a bounded existing combat footprint")
		observations[kind]={"triangles":triangles,"collapsed":collapsed,"meshes":meshes.size(),"surfaces":surfaces,"bounds":str(bounds)}
		var expected={"CrewSeatLeft":Vector3(-.59,1.2,.35),"CrewSeatRight":Vector3(.59,1.2,.35),"PilotSeat":Vector3(0,1.2,-1.45),"SkiffGunYaw":Vector3(0,2.04,-1.95),"SkiffMuzzle":Vector3(0,2.04,-3.05)} if kind=="skiff" else {"GunboatGunYaw":Vector3(0,3.2,-1.7),"GunboatGunPitch":Vector3(0,3.6,-1.7),"GunboatMuzzle":Vector3(0,3.6,-3.5),"WeaponDamageAnchor":Vector3(0,3.4,-1.7),"EngineDamageAnchor":Vector3(0,3.2,2.8),"EngineExhaust":Vector3(0,3.18,3.8)}
		for name in expected:
			var marker=MMFAssets.find_named(node,name)
			check(marker!=null and node.to_local(marker.global_position).distance_to(expected[name])<.001,kind+": preserves authored "+name)
		await frames()
		var bracket=node.to_global(Vector3(.6,1.74 if kind=="skiff" else 3.255,-1.95 if kind=="skiff" else -1.7))
		check(not game.raycast(bracket,bracket-Vector3.RIGHT*.35,[],128).is_empty(),kind+": gun elevation bracket reaches its supporting slew race")
		if kind=="skiff":
			for x in [-.54,.54]:
				var from=node.to_global(Vector3(x+.13,.724,3.20));var hit=game.raycast(from,from-Vector3(0,0,.55),[],128)
				check(not hit.is_empty() and node.to_local(hit.position).z>2.71,"Skiff exhaust has real recessed depth beyond the hull at X "+str(x))
			for x in [-.68,.68]:
				var from=node.to_global(Vector3(x+.025,2.40,2.22));var hit=game.raycast(from,from-Vector3.UP*.4,[],128)
				check(not hit.is_empty() and node.to_local(hit.position).y<2.11,"Skiff exhaust riser is open to its recessed baffle at X "+str(x))
			for x in [-.59,.59]:
				var at=node.to_global(Vector3(x,1.224,.35));var supported=true
				for offset in [Vector3.ZERO,Vector3(.18,0,.16),Vector3(-.18,0,-.16)]:
					var hit=game.raycast(at+offset+Vector3.UP*.10,at+offset-Vector3.UP*.12,[],128)
					supported=supported and not hit.is_empty() and absf(hit.position.y-at.y)<.003
				check(supported,"Skiff actual exported deck supports both feet at crew X "+str(x))
				var query=PhysicsShapeQueryParameters3D.new();query.collision_mask=128;query.margin=.002
				var capsule=CapsuleShape3D.new();capsule.radius=.56;capsule.height=1.92;query.shape=capsule;query.transform.origin=at+Vector3.UP*.98
				check(game.get_world_3d().direct_space_state.intersect_shape(query).is_empty(),"Heavy standing capsule clears actual skiff fittings at crew X "+str(x))
		node.queue_free();await frames()
func clear_encounter():
	game.combat.boarding.clear()
	for enemy in game.combat.enemies:
		if is_instance_valid(enemy):enemy.queue_free()
	game.combat.enemies.clear();game.combat.crew.clear()
	for node in [game.combat.ship,game.combat.hook]:
		if is_instance_valid(node):node.queue_free()
	game.combat.ship=null;game.combat.hook=null;game.combat.ship_state="none"
	for shell in game.combat.shells:shell.marker.queue_free()
	game.combat.shells.clear();await frames()
func behavior():
	for kind in ["skiff","gunboat"]:
		game.combat.begin_ship(kind,false,true);game.combat.ship.position=Vector3(game.combat.ship_side*(18 if kind=="gunboat" else 17),6,0)
		for enemy in game.combat.crew:enemy.set_physics_process(false)
		game.combat.update_ship(0);var view=game.combat.craft
		await frames()
		var zones=MMFAssets.of_type(game.combat.ship,"StaticBody3D")
		check(zones.size()==(3 if kind=="gunboat" else 1),kind+": refined art adds no extra combat or walking collision")
		var origin=game.combat.ship.global_position
		for part in (["hull","weapon","engine"] if kind=="gunboat" else ["hull"]):
			var local=Vector3(0,1.2,0) if part=="hull" else Vector3(0,3.4,-1.7) if part=="weapon" else Vector3(0,3.2,2.8)
			var size=Vector3(3.4,2.8,9) if kind=="gunboat" and part=="hull" else Vector3(3,2,6) if part=="hull" else Vector3(1.6,1.3,1.8)
			var armor=(6 if kind=="gunboat" else 5) if part=="hull" else 2 if part=="weapon" else 4
			var hit=game.raycast(origin+local+Vector3.RIGHT*4,origin+local,[],4)
			check(not hit.is_empty() and hit.collider.position.is_equal_approx(local) and hit.collider.get_child(0).shape.size.is_equal_approx(size) and hit.collider.armor==armor,kind+": actual "+part+" shot target preserves original position, size and armor")
			if not hit.is_empty():
				var field="ship_health" if part=="hull" else part+"_health";var before=game.combat.get(field)
				hit.collider.take_weapon_damage(20,hit.position,5,50,30)
				check(is_equal_approx(before-game.combat.get(field),20-armor),kind+": actual "+part+" hit retains original damage")
		check(not view.weapon_lenses.is_empty(),kind+": actual fire-control optic has an independent state material")
		for side in [-1,1]:
			game.player.teleport(Vector3(side*6,16.1,4));view.update(3)
			var forward=-view.muzzle.global_basis.z.normalized();var target=(game.player.position+Vector3.UP-view.pitch.global_position).normalized()
			check(forward.dot(target)>.999,kind+": visible bore points toward the player, side "+str(side))
		var ammo=game.session.weapons[game.session.current_weapon].ammoInMag;var health=game.session.health
		game.combat.volley_timer=.001;game.combat.update_ship(.002)
		check(view.recoil_left>0 and view.recoil.position.z>.06,kind+": the original volley drives visible recoil")
		check(game.combat.shells.size()==(2 if kind=="gunboat" else 3),kind+": original shell count is retained")
		check(game.session.health==health and game.session.weapons[game.session.current_weapon].ammoInMag==ammo,kind+": cosmetic recoil adds no immediate damage or player ammo changes")
		var shot=view.shot_origin();check(shot.distance_to(view.muzzle.global_position)<.001,kind+": shot presentation uses the actual moving muzzle")
		view.update(.2);check(view.recoil_left==0 and is_zero_approx(view.recoil.position.z),kind+": recoil returns to the authored rest origin")
		game.combat.weapon_health=0;view.update(0)
		check(view.weapon_lenses.all(func(m):return m.emission_energy_multiplier==0),kind+": disabled weapon optics go dark")
		var at=view.recoil.position;view.fire();check(view.recoil_left==0 and view.recoil.position==at,kind+": a disabled cannon cannot trigger cosmetic firing")
		if kind=="gunboat":
			check(not view.engine_lenses.is_empty(),"Gunboat engine has an independently driven state lens")
			game.combat.engine_health=0;view.update(0)
			check(view.engine_lenses.all(func(m):return m.emission_energy_multiplier==0),"Destroyed gunboat drive indicator goes dark")
		var fresh=MMFRaiderCraft.model(kind);var source_lens=[]
		for item in MMFAssets.of_type(fresh,"MeshInstance3D"):
			for i in item.mesh.get_surface_count():
				var mat=item.mesh.surface_get_material(i)
				if mat.resource_name=="Raider targeting lens":source_lens.append(mat)
		check(not source_lens.is_empty() and source_lens.all(func(m):return m.emission_energy_multiplier>0),kind+": damage never mutates the shared source materials")
		fresh.free();await clear_encounter()
func footing():
	observations.footing={}
	MMFEnemyAnimation.footing.clear()
	for kind in game.data.ENEMIES:
		check(MMFAssets.json("res://data/enemy-footing.json").models[kind].sourceSha256==FileAccess.get_sha256("res://assets/models/authored/"+kind+".glb"),kind+": offline footing matches the current authored model")
		var start=Time.get_ticks_usec();var enemy=game.combat.spawn(kind,Vector3(50,16,0),true);enemy.set_physics_process(false)
		var first=(Time.get_ticks_usec()-start)/1000.;enemy.animator.callback_mode_process=AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
		var min_height=INF;var max_height=-INF
		for time in [0.,.1,.25,.5]:
			enemy.animator.seek(time,true);await frames()
			var heights=preload("res://tests/enemy_sole_geometry.gd").foot_heights(enemy)
			for height in heights:min_height=minf(min_height,height);max_height=maxf(max_height,height)
		check(min_height>15.975 and max_height<16.025,kind+": evaluated idle boot geometry rests on the character support plane")
		check(enemy.get_child(0).position.is_equal_approx(Vector3(0,.96,0)) and is_equal_approx(enemy.get_child(0).shape.height,1.92) and enemy.health==enemy.definition.maxHealth,kind+": visual grounding retains the original collision and health")
		var offset=enemy.visual.position.y;enemy.queue_free();await frames()
		start=Time.get_ticks_usec();enemy=game.combat.spawn(kind,Vector3(50,16,0),true);enemy.set_physics_process(false)
		var cached=(Time.get_ticks_usec()-start)/1000.
		check(is_equal_approx(offset,enemy.visual.position.y),kind+": repeated spawn reuses stable grounding")
		observations.footing[kind]={"minSoleY":min_height,"maxSoleY":max_height,"firstSpawnMs":first,"cachedSpawnMs":cached,"visualY":offset}
		enemy.queue_free();await frames()
	game.combat.enemies.clear()
func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	await geometry();await behavior();await footing()
	var file=FileAccess.open("res://../test-results/godot-native/raider-craft-tests.json",FileAccess.WRITE);file.store_string(JSON.stringify({"checks":checks,"failures":failures,"passed":failures.is_empty(),"observations":observations},"\t"));file.close()
	print("RAIDER_CRAFT_RESULT ",checks," checks, ",failures.size()," failures")
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit",0 if failures.is_empty() else 1)

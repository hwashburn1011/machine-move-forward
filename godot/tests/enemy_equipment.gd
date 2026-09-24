extends SceneTree

var game
var checks=0
var failures=[]
var observed={}
func _initialize():set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-enemy-equipment-tests/";call_deferred("run")
func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)
func frames(count=2):
	for i in count:await physics_frame
func spawn(kind: String):
	var enemy=game.combat.spawn(kind,Vector3(50,16.05,0));enemy.set_physics_process(false)
	enemy.animator.callback_mode_process=AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	enemy.animator.advance(.1);return enemy
func remove(enemy):
	enemy.queue_free();await process_frame;game.combat.enemies.erase(enemy)

func compare_mesh(original: ArrayMesh,changed: ArrayMesh,joint: int,label: String) -> Array:
	var counts=[0,0];check(original.get_surface_count()==changed.get_surface_count(),label+" preserves surface count")
	var old=original.get("_surfaces");var new=changed.get("_surfaces")
	for i in old.size():
		var all_equal=true
		for key in old[i]:
			if key not in ["index_data","index_count","lods","material"]:all_equal=all_equal and old[i][key]==new[i].get(key)
		check(all_equal,label+" surface "+str(i)+" preserves exact stored geometry, skin, normals, UVs, bounds and format")
		var arrays=original.surface_get_arrays(i);var vertices=arrays[Mesh.ARRAY_VERTEX]
		var bones=arrays[Mesh.ARRAY_BONES];var weights=arrays[Mesh.ARRAY_WEIGHTS];var slots=bones.size()/vertices.size()
		var selected={}
		for v in vertices.size():
			var total=0.0
			for slot in slots:
				if bones[v*slots+slot]==joint:total+=weights[v*slots+slot]
			if total>.999:selected[v]=true
		var width=old[i].index_data.size()/old[i].index_count
		var before=[old[i].index_data];var after=[new[i].index_data];var thresholds=true
		for k in range(0,old[i].get("lods",[]).size(),2):
			thresholds=thresholds and old[i].lods[k]==new[i].lods[k]
			before.append(old[i].lods[k+1]);after.append(new[i].lods[k+1])
		check(thresholds,label+" surface "+str(i)+" retains LOD thresholds")
		var indices_match=true
		for level in before.size():
			var a: PackedByteArray=before[level];var b: PackedByteArray=after[level];var expected=[];var actual=[]
			for t in range(0,a.size(),width*3):
				var tri=[];var removed=0
				for k in 3:
					var index=a.decode_u16(t+k*width) if width==2 else a.decode_u32(t+k*width)
					tri.append(index);removed+=int(selected.has(index))
				indices_match=indices_match and removed in [0,3]
				if removed==0:expected.append_array(tri)
				else:counts[0 if level==0 else 1]+=1
			for k in range(0,b.size(),width):actual.append(b.decode_u16(k) if width==2 else b.decode_u32(k))
			indices_match=indices_match and expected==actual
		check(indices_match,label+" surface "+str(i)+" removes only complete drone triangles at every LOD, preserving order/winding")
	if original.shadow_mesh:
		check(changed.shadow_mesh!=null,label+" retains shadow mesh")
		compare_mesh(original.shadow_mesh,changed.shadow_mesh,joint,label+" shadow")
	else:check(changed.shadow_mesh==null,label+" preserves original shadow representation")
	return counts

func test_body():
	var original=MMFAssets.scene("models/authored/sovereign.glb");var body=MMFAssets.find_named(original,"sovereign_CombatBody")
	var joint=-1
	for i in body.skin.get_bind_count():
		if body.skin.get_bind_name(i)==&"equipment_0":joint=i
	check(joint>=0,"Source has dedicated equipment skin binding")
	var counts=compare_mesh(body.mesh,MMFEnemyEquipment.SOVEREIGN_BODY,joint,"body")
	check(counts==[3856,1884],"Exactly 3856 original drone triangles and 1884 LOD triangles are removed")
	var manifest=MMFAssets.json("res://art/sovereign-body.json")
	check(manifest.sourceSha256==FileAccess.get_sha256("res://assets/models/authored/sovereign.glb"),"Separation manifest matches current authored source")
	var enemy=spawn("sovereign");await frames()
	var replacement=MMFAssets.find_named(enemy.visual,"sovereign_CombatBody")
	check(replacement.mesh==MMFEnemyEquipment.SOVEREIGN_BODY and replacement.skin==body.skin,"Actual commander uses trimmed body and exact original Skin resource")
	for i in body.mesh.get_surface_count():
		check(replacement.mesh.surface_get_material(i)==null and replacement.get_active_material(i)==body.get_active_material(i),"Actual body surface "+str(i)+" reuses exact original material/textures without embedded duplicates")
	check(enemy.visual.scale.is_equal_approx(Vector3.ONE*1.92/MMFAssets.bounds(original).size.y),"Grounded character fit uses unchanged original bounds")
	var triangles=0;var collapsed=0
	var meshes=MMFAssets.of_type(enemy.drone_visual,"MeshInstance3D")
	for mesh in meshes:
		for i in mesh.mesh.get_surface_count():
			var a=mesh.mesh.surface_get_arrays(i);var vertices=a[Mesh.ARRAY_VERTEX];var indices=a[Mesh.ARRAY_INDEX]
			triangles+=indices.size()/3
			for t in range(0,indices.size(),3):
				if (vertices[indices[t+1]]-vertices[indices[t]]).cross(vertices[indices[t+2]]-vertices[indices[t]]).length_squared()<1e-24:collapsed+=1
	check(triangles<=50000 and meshes.size()==7 and collapsed==0,"Imported drone preserves smooth geometry in seven batches, under 50000 triangles, no collapsed faces")
	check(MMFAssets.of_type(enemy.drone_visual,"Light3D").is_empty(),"Drone uses materials without adding realtime lights")
	observed.drone={"triangles":triangles,"meshes":meshes.size(),"collapsed":collapsed}
	var another=spawn("sovereign")
	check(MMFAssets.find_named(another.visual,"sovereign_CombatBody").mesh==replacement.mesh and MMFAssets.of_type(another.drone_visual,"MeshInstance3D")[0].mesh==meshes[0].mesh,"Multiple commanders share body and drone mesh resources")
	await remove(another);await remove(enemy);original.free()

func test_drone():
	var enemy=spawn("sovereign");var sphere=MMFAssets.find_named(enemy.drone_visual,"DroneCenter")
	var skeleton=MMFAssets.of_type(enemy.visual,"Skeleton3D")[0];var bone=skeleton.find_bone("equipment_0")
	for clip in ["idle","walk","run","polish_attack"]:
		enemy.play(clip,true)
		for angle in [0,1.3,-2.4]:
			enemy.visual.rotation.y=angle;enemy.animator.advance(.17);await frames()
			var authored=(skeleton.global_transform*skeleton.get_bone_global_pose(bone)).origin
			check(enemy.drone.global_position.distance_to(sphere.global_position)<.0001 and authored.distance_to(sphere.global_position)<.0001,clip+" orb and hit target follow authored pose at yaw "+str(angle))
			var col=enemy.drone.get_child(0);var size=col.shape.size*col.global_basis.get_scale()
			check(size.is_equal_approx(Vector3.ONE*.55),clip+" retains 55 cm physical target")
			var normal=enemy.drone_visual.global_basis.z.normalized()
			var hit=game.raycast(sphere.global_position+normal*.8,sphere.global_position-normal*.15,[],4)
			check(not hit.is_empty() and hit.collider==enemy.drone,clip+" physical shot hits the visible animated drone")
	var ally=spawn("warden");ally.position=enemy.position+Vector3(3,0,0)
	var hp=ally.health;ally.take_damage(25,ally.position)
	check(is_equal_approx(hp-ally.health,(25-ally.definition.armor)*.8),"Live drone preserves existing 20 percent nearby shield")
	ally.position=enemy.position+Vector3(7.1,0,0);hp=ally.health;ally.take_damage(25,ally.position)
	check(is_equal_approx(hp-ally.health,25-ally.definition.armor),"Shield range remains seven metres")
	enemy.drone.take_damage(34,enemy.drone.global_position)
	check(enemy.drone_health==1 and enemy.drone_visual.visible and enemy.drone.collision_layer==4,"Drone retains 35 health and no armour")
	var cursor=game.effects.explosion_cursor;var at=enemy.drone.global_position
	enemy.drone.take_damage(1,at)
	check(enemy.drone_health==0 and not enemy.drone_visual.visible and enemy.drone.collision_layer==0,"Final drone hit removes the entire visible orb and its target")
	check(game.effects.explosion_pool[cursor].node.position.distance_to(at)<.0001 and game.effects.explosion_pool[cursor].node.scale.is_equal_approx(Vector3.ONE*.3),"One existing small destruction effect originates at actual orb")
	enemy.drone.take_damage(100,at)
	check(game.effects.explosion_cursor==(cursor+1)%8,"Repeat hits cannot replay destruction")
	ally.position=enemy.position+Vector3(3,0,0);hp=ally.health;ally.take_damage(25,ally.position)
	check(is_equal_approx(hp-ally.health,25-ally.definition.armor),"Destroyed drone immediately stops shielding")
	check(not enemy.dead and MMFAssets.find_named(enemy.visual,"sovereign_CombatBody").visible,"Drone destruction leaves commander alive and visible")
	enemy.visual.rotation.y=0;enemy.play("idle",true);enemy.animator.advance(.2);await frames()
	enemy.committed=enemy.position+Vector3(0,1,8);game.effects.tracers.clear();enemy.shoot_committed()
	check(game.effects.tracers.size()==1 and game.effects.tracers.back().a.distance_to(enemy.equipment.palm.global_position)<.0001,"Commander continues its existing attack from open palm after losing support drone")
	await remove(ally);await remove(enemy)
	enemy=spawn("sovereign");await frames();var orb=enemy.drone_visual;var zone=enemy.drone
	cursor=game.effects.explosion_cursor;enemy.take_damage(10000,enemy.position)
	check(enemy.dead and enemy.drone_health==0 and not orb.visible and zone.collision_layer==0,"Commander death disables drone, shield and target together")
	enemy.animator.advance(1.5);await frames()
	check(not orb.is_visible_in_tree(),"No floating drone remains beside the fallen commander")
	enemy._physics_process(5.1);await process_frame
	check(not is_instance_valid(enemy) and not is_instance_valid(orb) and not is_instance_valid(zone),"Existing corpse expiry releases attached equipment and hit zone")
	game.combat.enemies.clear()

func test_shots(kind: String):
	var enemy=spawn(kind);await frames()
	for angle in [0,.8,-1.2]:
		enemy.visual.rotation.y=angle;enemy.play("idle",true);enemy.animator.advance(.2);await frames()
		var direction=Vector3(sin(angle),0,cos(angle));enemy.committed=enemy.position+Vector3.UP*1.2+direction*8
		game.effects.tracers.clear();enemy.shoot_committed()
		check(game.effects.tracers.size()==1 and game.effects.tracers.back().a.distance_to(enemy.equipment.muzzle.global_position)<.0001,kind+" tracer originates at actual weapon socket at yaw "+str(angle))
		enemy.animator.advance(.06);await frames();game.effects.tracers.clear();enemy.shoot_committed()
		check(game.effects.tracers.size()==1 and game.effects.tracers.back().a.distance_to(enemy.equipment.muzzle.global_position)<.0001,kind+" socket follows recoil")
	enemy.visual.rotation.y=0;enemy.play("idle",true);enemy.animator.advance(.2);await frames()
	game.player.teleport(enemy.position+Vector3(0,0,8));enemy.committed=game.player.position+Vector3.UP
	var wall=MMFAssets.box(game,Vector3(4,3,.1),enemy.position+Vector3(0,1.4,4));await frames()
	game.session.health=100;game.effects.tracers.clear();enemy.shoot_committed()
	check(game.session.health==100 and game.effects.tracers.size()==1 and game.effects.tracers.back().b.z<enemy.position.z+4,kind+" cover blocks damage and stops visible tracer at front surface")
	wall.position.z=enemy.position.z+.12;await frames();game.effects.tracers.clear();enemy.shoot_committed()
	check(game.session.health==100 and game.effects.tracers.is_empty(),kind+" barrel through close cover does not draw a backwards tracer or damage player")
	wall.queue_free();await frames();game.effects.tracers.clear();enemy.shoot_committed()
	check(is_equal_approx(game.session.health,100-enemy.definition.damage),kind+" clear shot retains original damage")
	await remove(enemy)

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	MMFAssets.box(game,Vector3(24,1,24),Vector3(50,15.5,0));game.player.teleport(Vector3(62,16.05,0))
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	await test_body();await test_drone()
	for kind in ["warden","bastion","sovereign"]:await test_shots(kind)
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"observed":observed}
	var file=FileAccess.open("res://../test-results/godot-native/enemy-equipment.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close();print("ENEMY_EQUIPMENT ",report)
	game.open_menu("Pause");var refs=preload("res://tests/audio_drain.gd").capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs);call_deferred("quit",0 if failures.is_empty() else 1)

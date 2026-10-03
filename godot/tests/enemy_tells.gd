extends SceneTree

var game
var checks=0
var failures=[]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://beta-next-enemy-tells/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func state_snapshot(e) -> Array:
	return [e.phase,e.timer,e.cooldown,e.windup,e.shots_left,e.committed,e.lunge_direction,e.health,e.mission,e.position,game.session.rng.seed]

func run():
	var vertices=MMFEnemyTells.direction_mesh().surface_get_arrays(0)[Mesh.ARRAY_VERTEX]
	for triangle in 3:
		var at=triangle*3
		check((vertices[at+1]-vertices[at]).cross(vertices[at+2]-vertices[at]).y<0,"Direction triangle "+str(triangle)+" faces the above-floor camera with Godot clockwise front winding")
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	for i in 5:await physics_frame
	game.started=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	game.player.teleport(Vector3(60,16.04,3))
	var kinds=["scavenger","raider","warden","revenant","bastion","sovereign"]
	var previous_mesh: Mesh
	for kind in kinds:
		var e=game.combat.spawn(kind,Vector3(60,16.04,0));e.set_physics_process(false)
		var initial=state_snapshot(e);var tells=e.tells
		tells.update(.1)
		check(e.hp_label.text=="━".repeat(7),kind+" uses only the existing health bar without floating command captions")
		check(state_snapshot(e)==initial,kind+" presentation leaves controller, position and RNG untouched")
		check(tells.arrow.mesh==MMFEnemyTells.direction_mesh(),kind+" uses shared nine-vertex direction mesh")
		if previous_mesh:check(previous_mesh==tells.arrow.mesh,kind+" shares the exact geometry resource across actors")
		previous_mesh=tells.arrow.mesh
		if kind in ["warden","bastion","sovereign"]:
			e.committed=Vector3(63,17.04,4);e.windup=.8
			var before=tells.cue_count;initial=state_snapshot(e);tells.update(.05)
			check(tells.state in ["rifle_lock","burst_lock","relay_lock"] and tells.arrow.visible,kind+" exposes the existing committed windup")
			check(tells.cue_count==before+1,kind+" windup has one transition sound")
			var angle=tells.arrow.rotation.y;var node_count=e.get_child_count();var material=tells.arrow.material_override
			game.player.position+=Vector3(-3,0,0)
			for i in 20:tells.update(.01)
			check(is_equal_approx(angle,tells.arrow.rotation.y),kind+" direction remains on committed aim after a dodge")
			check(tells.cue_count==before+1 and e.get_child_count()==node_count and material==tells.arrow.material_override,kind+" stable warning reuses nodes, material and one-shot cue")
			check(state_snapshot(e)==initial,kind+" warning never retargets or changes attack cadence")
			e.windup=0;e.shots_left=0
		if kind=="revenant":
			e.phase="telegraph";e.lunge_direction=Vector3.RIGHT;tells.update(.1)
			check(tells.state=="blade_commit" and is_equal_approx(tells.arrow.rotation.y,PI/2),"Revenant tells the actual fixed lunge direction")
			e.phase="recovery";tells.update(.1)
			check(tells.state=="blade_recover" and not tells.arrow.visible and e.hp_label.modulate.g>e.hp_label.modulate.r,"Revenant recovery clears the committed danger direction without floating commands")
		if kind=="bastion":
			e.phase="vent";tells.update(.1)
			check(tells.state=="vent" and e.tactical_marker.material_override==e.WARNING_VULNERABLE,"Bastion vent keeps its physical vulnerability cue without a floating command")
		if kind=="sovereign":
			tells.update(.1)
			check(tells.state=="shield_relay" and e.drone_visual.visible,"Sovereign retains the actual visible shield drone without floating instructions")
			var before=tells.cue_count;e.equipment.disable_drone(e);tells.update(.1)
			check(tells.state=="relay_broken" and tells.cue_count==before+1,"Destroying the actual drone gives one clear acknowledgment")
			for i in 10:tells.update(.01)
			check(tells.cue_count==before+1,"Drone acknowledgment does not replay each frame")
		if kind=="raider":
			check(tells.state=="sabotage" and e.mission_subsystem=="engine" and e.hp_label.text=="━".repeat(7),"Saboteur retains its engine objective without a floating command")
		if kind=="scavenger":check(tells.state=="closing","Scavenger tells existing close-range pressure without adding windup")
		e.inactive=true;tells.update(.1);check(not tells.arrow.visible and tells.state=="",kind+" inactive actor clears its tell")
		e.inactive=false;e.dead=true;tells.update(.1);check(not tells.arrow.visible,kind+" dead actor leaves no warning direction")
		e.queue_free();await process_frame;game.combat.enemies.clear();game.player.position=Vector3(60,16.04,3)
	game.audio.muted=true;game.audio.muted=false
	game.audio.play_at("servo-load",game.player.position,.1,.74)
	check(game.audio.spatial_voices.any(func(v):return v.stream!=null and is_equal_approx(v.pitch_scale,.74)),"Distinct warning pitch uses the existing bounded spatial voice pool")
	game.audio.muted=true
	check(game.audio.spatial_voices.all(func(v):return v.stream==null),"Mute stops and releases pitched cues")
	var output="res://../test-results/deck-audio/enemy-tells.json"
	var file=FileAccess.open(output,FileAccess.WRITE);file.store_string(JSON.stringify({"checks":checks,"failures":failures,"presentation_only":true},"\t"));file.close()
	print("ENEMY_TELLS_RESULT ",checks," checks; failures: ",failures)
	while game.combat.nav.is_baking():await process_frame
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();MMFEnemyTells.clear_cache();await preload("res://tests/audio_drain.gd").finish(self,refs)
	call_deferred("quit",0 if failures.is_empty() else 1)

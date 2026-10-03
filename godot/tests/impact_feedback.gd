extends SceneTree

var game
var checks=0
var failures=[]
func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)
func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://native-impact-feedback/";call_deferred("run")
func frames(n=2):
	for i in n:await physics_frame
	await process_frame
func hit(target,point: Vector3) -> Dictionary:return {"collider":target,"position":point,"normal":Vector3.FORWARD}
func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	MMFAssets.box(game,Vector3(24,1,24),Vector3(50,15.5,0));game.player.teleport(Vector3(50,16.05,5))
	var enemy=game.combat.spawn("bastion",Vector3(50,16.05,0));enemy.set_physics_process(false)
	await frames(4)
	var point=enemy.position+Vector3.UP*1.4
	var armor=float(enemy.definition.armor);var before=enemy.health;var pulses=game.ui.reticle.pulse_count;var rng=game.session.rng.state
	game.ui.hit_left=0
	var result=MMFOwnedShot.resolve(hit(enemy,point),20,0,100,1,"owned_auto_turret")
	check(is_equal_approx(result.applied_damage,20-armor) and is_equal_approx(enemy.health,before-(20-armor)),"Armor is applied once by the authoritative damage calculation")
	MMFCombatFeedback.present(game,result);MMFCombatFeedback.confirm(game,result)
	check(game.ui.reticle.pulse_count==pulses and game.ui.hit_left==0,"Automatic damage produces no personal reticle or combat text")
	check(game.session.rng.state==rng,"Feedback presentation consumes no gameplay RNG")
	enemy.phase="vent";before=enemy.health
	result=MMFOwnedShot.resolve(hit(enemy,point),20,0,100,1,"player_weapon")
	check(result.exposed and is_equal_approx(result.applied_damage,(20-armor)*2),"Upper vent exposure is captured before damage and retains its multiplier")
	MMFCombatFeedback.confirm(game,result)
	check(game.ui.reticle.pulse_count==pulses+1 and game.ui.hit_readout.text=="EXPOSED HIT","Player exposure emits one correctly classified confirmation")
	var lower=MMFOwnedShot.resolve(hit(enemy,enemy.position+Vector3.UP*.5),20,0,100,1,"player_weapon")
	check(not lower.exposed and MMFCombatFeedback.label(lower)=="ARMOUR HIT","Lower vent-phase hits remain armored")
	var summary={}
	for impact in [lower,result,lower]:summary=MMFCombatFeedback.summarize(summary,impact)
	pulses=game.ui.reticle.pulse_count;MMFCombatFeedback.confirm(game,summary)
	check(game.ui.reticle.pulse_count==pulses+1 and summary.exposed,"A pellet group produces one deterministic highest-value summary")
	before=enemy.health;pulses=game.ui.reticle.pulse_count
	var blocked=MMFOwnedShot.resolve(hit(enemy,point),1,0,100,1,"player_weapon");MMFCombatFeedback.confirm(game,blocked)
	check(blocked.blocked and blocked.applied_damage==0 and enemy.health==before and game.ui.reticle.pulse_count==pulses,"Zero applied damage never claims a successful hit")
	var far=MMFOwnedShot.resolve(hit(enemy,point),20,101,100,1,"player_weapon")
	check(far.applied_damage==0 and enemy.health==before,"Range falloff remains authoritative")
	var protected=game.combat.spawn("sovereign",Vector3(52,16.05,0));protected.set_physics_process(false)
	enemy.phase="idle";before=enemy.health
	result=MMFOwnedShot.resolve(hit(enemy,point),20,0,100,1,"player_weapon")
	check(is_equal_approx(result.applied_damage,(20-armor)*.8),"Sovereign protection is measured from actual applied health loss")
	protected.queue_free();await frames(2)
	var owned=StaticBody3D.new();game.add_child(owned);owned.collision_layer=1;owned.set_meta("piece_id","fixture")
	var own_result=MMFOwnedShot.resolve(hit(owned,point),999,0,100,1,"player_weapon")
	check(not own_result.hostile and own_result.collision and own_result.applied_damage==0,"Owned geometry remains collision without hostile damage")
	var friendly=StaticBody3D.new();game.add_child(friendly)
	check(not MMFOwnedShot.resolve(hit(friendly,point),999).hostile,"Friendly objects cannot become hostile through presentation")
	check(not MMFOwnedShot.resolve({},99).collision,"A miss has no fabricated impact")
	var health={"value":18.0};var calls={"count":0};var zone=MMFHitZone.new();zone.armor=3
	zone.health_reader=func():return health.value
	zone.setup(game,Vector3(60,17,0),Vector3.ONE,func(amount,_point):calls.count+=1;health.value=maxf(0,health.value-maxf(0,amount-3)))
	var zone_result=MMFOwnedShot.resolve(hit(zone,zone.position),30,0,100,1,"player_manual_turret")
	check(calls.count==1 and zone_result.killed and zone_result.applied_damage==18 and zone_result.armor==3,"Component receiver executes once and returns clamped lethal damage")
	zone.collision_layer=0
	check(MMFOwnedShot.resolve(hit(zone,zone.position),30).applied_damage==0 and calls.count==1,"Disabled hit zones cannot take another presentation-driven hit")
	enemy.health=1;enemy.phase="vent";result=MMFOwnedShot.resolve(hit(enemy,point),20,0,100,1,"player_weapon")
	check(result.killed and result.exposed and result.applied_damage==1 and MMFCombatFeedback.label(result)=="ELIMINATED","Lethal exposure retains pre-hit state and actual remaining damage")
	check(enemy.presentation.hit_pose==null or not enemy.presentation.hit_pose.active,"Death clears its hit-reaction modifier")
	var nodes=game.audio.get_child_count();game.audio.muted=true
	for i in 100:game.audio.combat_impact(point,"exposed")
	check(game.audio.get_child_count()==nodes,"Impact sounds reuse bounded voices, including muted overload")
	print("IMPACT_FEEDBACK ",checks," checks; failures: ",failures)
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit(0 if failures.is_empty() else 1)

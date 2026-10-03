extends SceneTree

var game
var checks=0
var failures=[]
var statistics=[]
var carrier_patterns=[]
var base=Vector3(200,100,0)
var cover: StaticBody3D

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://enemy-ballistics-tests/"
	call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func frames(count: int=3):
	for i in count:await physics_frame

func solid(size: Vector3,at: Vector3) -> StaticBody3D:
	var body=StaticBody3D.new();body.collision_layer=1;body.collision_mask=0
	var collision=CollisionShape3D.new();var box=BoxShape3D.new();box.size=size;collision.shape=box;body.add_child(collision)
	game.add_child(body);body.position=at;return body

func sampling():
	var stream=MMFEnemyBallistics.rng_for(["accuracy","statistics"])
	var replay=MMFEnemyBallistics.rng_for(["accuracy","statistics"])
	var other=MMFEnemyBallistics.rng_for(["accuracy","other"])
	var origin=base+Vector3(0,1,-12);var target=base+Vector3.UP
	var same=true;var different=false
	for i in 100:
		var point=MMFEnemyBallistics.aim_point(origin,target,stream)
		same=same and point==MMFEnemyBallistics.aim_point(origin,target,replay)
		different=different or point!=MMFEnemyBallistics.aim_point(origin,target,other)
	check(same,"Seeded aim streams replay exact physical samples")
	check(different,"Separate actor stream identities do not synchronize aim")
	check(MMFEnemyBallistics.spread_radius(0)>0,"Close-range spread is nonzero")
	var rates=[]
	for distance in [2.0,12.0,32.0,65.0]:
		stream=MMFEnemyBallistics.rng_for(["accuracy",distance])
		origin=base+Vector3(0,1,-distance)
		var hits=0;var samples=12000
		for i in samples:
			var direction=MMFEnemyBallistics.direction(origin,target,stream)
			var hit=game.raycast(origin,origin+direction*(distance+3),[],3)
			if not hit.is_empty() and hit.collider==game.player:hits+=1
		var rate=float(hits)/samples;rates.append(rate)
		statistics.append({"distance_m":distance,"samples":samples,"hits":hits,"hit_fraction":rate,"spread_radius_m":MMFEnemyBallistics.spread_radius(distance),"envelope":"actual standing player capsule radius0.34,height1.92,aimY1.0"})
		check(rate>0.02 and rate<.98,"Actual player-sized capsule can be hit and missed at %.0fm"%distance)
	check(rates[0]>rates[1]+.08 and rates[1]>rates[2]+.1 and rates[2]>rates[3]+.12,"Measured near/mid/far capsule hit rates strictly decrease with meaningful separation")
	check(rates[0]>.75 and rates[1]>.55 and rates[3]<.3,"Close attackers remain dangerous; long-range static guards have substantial misses")
	for direction in [Vector3.UP,Vector3.DOWN,Vector3(.2,.97,.1).normalized()]:
		var sampled=MMFEnemyBallistics.direction(base,base+direction*30,stream)
		check(sampled.is_finite() and is_equal_approx(sampled.length(),1),"Elevated/vertical aim keeps a finite normalized ray")
	# Ground dispersion preserves one shared imperfect centre for the authored offsets.
	var prior=0.0
	for distance in [5.0,25.0,60.0]:
		var missed=0
		for i in 5000:
			var point=MMFEnemyBallistics.ground_point(base+Vector3(0,0,-distance),base,stream)
			if point.distance_to(base)>=2:missed+=1
		var rate=float(missed)/5000
		statistics.append({"shell_distance_m":distance,"samples":5000,"outside_2m_blast_fraction":rate})
		check(rate>prior,"Physical shell centres increasingly miss a stationary target at %.0fm"%distance);prior=rate

func enemy_paths():
	var loot_rng=game.session.rng.seed
	for kind in ["warden","bastion","sovereign"]:
		var e=game.combat.spawn(kind,base+Vector3(0,0,-8));e.set_physics_process(false)
		e.aim_rng=MMFEnemyBallistics.rng_for(["integration",kind]);e.committed=base+Vector3.UP
		game.player.teleport(base);game.session.health=10000;await frames()
		var hits=0;var misses=0
		for i in 160:
			var health=game.session.health;e.shoot_committed()
			var damage=health-game.session.health
			if damage==0:misses+=1
			elif is_equal_approx(damage,e.definition.damage):hits+=1
			else:check(false,kind+" preserves its exact damage on each actual hit")
		check(hits>70 and misses>10,kind+" existing shoot_committed produces real hits and misses")
		cover=solid(Vector3(4,3,.3),base+Vector3(0,1.5,-4));await frames()
		var health=game.session.health
		for i in 30:e.shoot_committed()
		check(game.session.health==health,kind+" sampled shots cannot pass through a solid wall")
		cover.position=e.position+Vector3.UP*1.4;await frames()
		for i in 20:e.shoot_committed()
		check(game.session.health==health,kind+" shot origin embedded inside cover is blocked")
		cover.queue_free();await frames()
		var chest=e.global_position+Vector3.UP*1.4
		var muzzle=e.equipment.shot_origin(e)
		cover=solid(Vector3(.09,.09,.09),chest.lerp(muzzle,.5));await frames()
		var guarded=MMFEnemyBallistics.trace(game,chest,muzzle,[e.get_rid()],1)
		check(not guarded.is_empty() and guarded.collider==cover,kind+" actual body-to-muzzle fixture intersects cover")
		for i in 20:e.shoot_committed()
		check(game.session.health==health,kind+" actual muzzle protruding across cover cannot bypass it")
		cover.position=muzzle;await frames()
		for i in 20:e.shoot_committed()
		check(game.session.health==health,kind+" actual muzzle inside cover cannot disagree with blocked tracer")
		cover.queue_free();await frames()
		# The original warning observes committed centre and plays once, even if
		# the player changes position before the physical sampled ray is fired.
		e.windup=e.definition.ranged.windup;var count=e.tells.cue_count;e.tells.update(.01)
		var angle=e.tells.arrow.rotation.y;game.player.teleport(base+Vector3(3,0,0));await frames()
		for i in 30:e.shoot_committed();e.tells.update(.01)
		check(game.session.health==health and e.committed==base+Vector3.UP,kind+" committed burst remains dodgeable without retargeting")
		check(e.tells.cue_count==count+1 and is_equal_approx(angle,e.tells.arrow.rotation.y),kind+" retains one existing warning cue and frozen intent arrow")
		if kind=="sovereign":
			e.equipment.disable_drone(e);health=game.session.health
			for i in 20:e.shoot_committed()
			check(game.session.health==health,"Commander palm fallback also uses committed spread after drone loss")
		e.queue_free();await frames();game.combat.enemies.clear()
	check(game.session.rng.seed==loot_rng,"Rifle misses never consume the session loot/progression RNG")

func shell_paths():
	game.player.teleport(base);game.session.health=10000;await frames()
	var impact=base+Vector3(0,0,-.75)
	var shell={"origin":base+Vector3(0,2,-8),"aim":impact,"target":impact,"normal":Vector3.UP,"damage":10.0}
	game.combat.resolve_shell(shell)
	check(game.session.health==9990,"Unobstructed physical shell retains exact ten-point blast damage")
	cover=solid(Vector3(4,3,.25),base+Vector3(0,1.5,-4));await frames()
	game.combat.resolve_shell(shell)
	check(game.session.health==9990,"Cover introduced after commitment intercepts the actual shell path")
	cover.queue_free();await frames()
	var removed_cover=shell.duplicate();removed_cover.target=base+Vector3(0,1,-4)
	game.combat.resolve_shell(removed_cover)
	check(game.session.health==9980,"Removed forecast cover lets shell continue to its committed endpoint, not explode in empty air")
	game.session.health=9990
	# The player is within two metres of the impact but on the far side of cover.
	cover=solid(Vector3(4,3,.12),base+Vector3(0,1.5,-.35));await frames()
	var near_shell={"target":impact,"normal":Vector3.UP,"damage":10.0}
	game.combat.resolve_shell(near_shell)
	check(game.session.health==9990,"Explosion proximity alone cannot damage a player through cover")
	var piece=solid(Vector3(.3,.5,.3),base+Vector3(1,.3,-.75));piece.set_meta("piece_id","test-piece");await frames()
	check(MMFEnemyBallistics.blast_clear(game,impact+Vector3.UP*.035,piece.position,"test-piece"),"Blast accepts the struck structure's own real collider")
	check(not MMFEnemyBallistics.blast_clear(game,impact+Vector3.UP*.035,base+Vector3.UP,"other-piece"),"Structure ID allowance cannot bypass intervening cover")
	piece.queue_free();cover.queue_free();await frames()
	game.player.teleport(base+Vector3(3,0,0));await frames();game.combat.resolve_shell(shell)
	check(game.session.health==9990,"Delayed shell impact does not follow a player who left the marked blast")
	# Exercise actual queue ownership with a physical floor and fixed gun origin.
	var muzzle=Node3D.new();game.add_child(muzzle);muzzle.position=base+Vector3(0,3,-8)
	game.combat.craft.muzzle=muzzle
	game.combat.queue_shell(base,1.65,10)
	check(game.combat.shells.size()==1,"Shell queues one supported physical warning")
	var queued=game.combat.shells[0];var target=queued.target
	check(is_equal_approx(queued.time,1.65) and queued.damage==10 and queued.origin==muzzle.position,"Shell retains committed origin, warning interval and damage")
	game.player.teleport(base+Vector3(5,0,0));await frames()
	check(queued.target==target and is_instance_valid(queued.marker),"Existing warning remains on its real fixed impact after a dodge")
	queued.marker.queue_free();game.combat.shells.clear();game.combat.craft.muzzle=null;muzzle.queue_free()
	var guardian=game.combat.guardian;guardian.pattern="cross"
	check(guardian.salvo_offsets()==[Vector3.ZERO,Vector3(-3,0,0),Vector3(3,0,0),Vector3(0,0,-3),Vector3(0,0,3)],"Guardian five-mark offsets remain unchanged around the dispersed centre")
	guardian.pattern="line";guardian.volleys=0
	check(guardian.salvo_offsets()==[Vector3(-2.2,0,0),Vector3.ZERO,Vector3(2.2,0,0)],"Guardian introductory line retains its exact two-point-two-metre spacing")

func carrier_paths():
	# Use the actual carrier and native Nomad geometry without a campaign-site
	# fixture: this catches side rails/overhead machinery intercepting the muzzle.
	game.player.teleport(Vector3(4,16.05,-6));await frames()
	var c=game.combat;var g=c.guardian
	check(g.begin(),"Actual guardian carrier launches for native shell-path proof")
	c.update_ship(c.approach_duration+.01);await frames()
	for pattern in ["line","cross"]:
		g.phase="lock";g.pattern=pattern;g.remaining=.01;g.update(.02)
		check(c.shells.size()==(3 if pattern=="line" else 5),"Native "+pattern+" salvo keeps its authored mark count")
		var recorded=[];var frozen=[]
		for shell in c.shells:
			recorded.append({"origin":shell.origin,"aim":shell.aim,"impact":shell.target,"warning":shell.time})
			frozen.append(shell.target)
			var hit=MMFEnemyBallistics.trace(game,shell.origin,shell.aim,[],1)
			check(hit.is_empty() or hit.position.distance_to(shell.target)<.002,"Native "+pattern+" warning sits at actual traced impact")
			check(shell.marker.position.distance_to(shell.target+shell.normal*.05)<.002 and shell.marker.basis.y.dot(shell.normal)>.99,"Native "+pattern+" warning is seated and oriented on its struck face")
		carrier_patterns.append({"pattern":pattern,"shells":recorded})
		game.player.position+=Vector3(-2,0,2);g.update(.1)
		check(c.shells.map(func(shell):return shell.target)==frozen,"Native "+pattern+" marks remain fixed after player motion")
		g.clear_salvo()
	g.reset();c.finish_ship();await frames()

func run():
	Engine.max_fps=120
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu();game.set_physics_process(false);game.player.set_physics_process(false)
	game.invulnerable=false;game.cinematic="";game.player.hit_grace=0
	solid(Vector3(100,.5,100),base-Vector3.UP*.27)
	game.player.teleport(base);await frames()
	var before=game.session.rng.seed
	sampling();check(game.session.rng.seed==before,"Statistical sampler does not touch session RNG")
	await enemy_paths();await shell_paths();await carrier_paths()
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"statistics":statistics,"carrier_patterns":carrier_patterns,"source_hash":MMFPlaytestRecorder.source_fingerprint(),"scope":"Seeded physical player-capsule ray statistics; actual three enemy shot paths, committed tells/dodge, projectile interception, world-only blast cover and actual carrier warning impacts on native Nomad. Headless controlled test, not human playtest."}
	var file=FileAccess.open("res://../test-results/roadside-outposts/accuracy/enemy-ballistics.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("ENEMY_BALLISTICS_RESULT ",JSON.stringify(report))
	while game.combat.nav.is_baking():await process_frame
	var refs=preload("res://tests/audio_drain.gd").capture(game.audio);game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await preload("res://tests/audio_drain.gd").finish(self,refs)
	call_deferred("quit",0 if failures.is_empty() else 1)

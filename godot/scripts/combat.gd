class_name MMFCombat
extends Node3D

var game
var enemies: Array = []
var ship: Node3D
var ship_state = "none"
var ship_kind = "skiff"
var ship_health = 0.0
var engine_health = 0.0
var weapon_health = 0.0
var hook_health = 0.0
var hook: MMFHitZone
var ship_side = 1
var ship_timer = 0.0
var volley_timer = 0.0
var crew: Array = []
var shells: Array = []
var loot: Array = []
var loot_view=MMFLootView.new()
var shot_clocks = {}
var encounter_had_enemies = false
var nav: NavigationRegion3D
var rope: MeshInstance3D
var raid_wave=0
var turret_aim={}
var mission=MMFRaidMission.new()
var nav_dirty=false
var nav_delay=0.0
var tutorial_ship=false
var disabled_time=0.0

func setup(owner_game):
	game=owner_game
	loot_view.setup(game)
	mission.setup(game)
	nav=NavigationRegion3D.new()
	var mesh=NavigationMesh.new()
	mesh.agent_radius=0.4
	mesh.agent_height=2.0
	mesh.agent_max_climb=0.45
	mesh.agent_max_slope=50
	mesh.cell_size=0.2
	mesh.cell_height=0.05
	NavigationServer3D.map_set_cell_size(game.get_world_3d().navigation_map,0.2)
	NavigationServer3D.map_set_cell_height(game.get_world_3d().navigation_map,0.05)
	mesh.geometry_parsed_geometry_type=NavigationMesh.PARSED_GEOMETRY_STATIC_COLLIDERS
	# Fabric has camera-only obstruction, not a walkable rooftop or enemy cover.
	mesh.geometry_collision_mask &= ~MMFMachineCanopy.CAMERA_LAYER
	mesh.geometry_source_geometry_mode=NavigationMesh.SOURCE_GEOMETRY_GROUPS_WITH_CHILDREN
	mesh.geometry_source_group_name="navigation_source"
	mesh.filter_baking_aabb=AABB(Vector3(-20,7,-20),Vector3(40,16,40))
	nav.navigation_mesh=mesh
	add_child(nav)
	game.world.add_to_group("navigation_source")
	game.building.add_to_group("navigation_source")
	nav.bake_navigation_mesh(true)

func spawn(kind: String,at: Vector3,inactive: bool=false) -> MMFEnemy:
	var enemy=MMFEnemy.new()
	add_child(enemy)
	enemy.setup(game,kind)
	enemy.position=at
	enemy.inactive=inactive
	enemies.append(enemy)
	encounter_had_enemies=true
	return enemy

func active_threat() -> bool:
	if ship_state not in ["none","retreat"]: return true
	for enemy in enemies:
		if is_instance_valid(enemy) and not enemy.dead and not enemy.inactive: return true
	return false

func begin_ship(kind: String="skiff",tutorial: bool=false,radio: bool=false):
	if ship_state!="none": return
	game.building.cancel()
	ship_kind=kind
	tutorial_ship=tutorial;disabled_time=0.0
	ship=MMFAssets.scene("models/authored/raider-"+("gunboat" if kind=="gunboat" else "skiff")+".glb")
	add_child(ship)
	var roster=MMFRandom.new()
	raid_wave=int(game.session.threat.get("radioWave",0))
	if radio: game.session.threat.radioWave=raid_wave+1
	roster.seed=MMFRandom.hash_seed([game.session.seed_name,"radio-side",raid_wave])
	ship_side=-1 if roster.randf()<0.5 else 1
	ship.position=Vector3(ship_side*30,5,-55)
	ship_state="approach"
	ship_health=420 if kind=="gunboat" else 220 if tutorial else 260
	engine_health=160
	weapon_health=120
	hook_health=45 if tutorial else 60
	ship_timer=0
	volley_timer=3
	crew.clear()
	var hull=MMFHitZone.new();hull.armor=6 if kind=="gunboat" else 5
	hull.setup(ship,Vector3(0,1.2,0),Vector3(3.4,2.8,9) if kind=="gunboat" else Vector3(3,2,6),func(amount,point):
		ship_health-=maxf(0,amount-(6 if ship_kind=="gunboat" else 5))
		if ship_health<=0: destroy_ship(point))
	if kind=="gunboat":
		for subsystem in ["engine","weapon"]:
			var zone=MMFHitZone.new();zone.armor=4 if subsystem=="engine" else 2
			var at=Vector3(0,3.2,2.8) if subsystem=="engine" else Vector3(0,3.4,-1.7)
			zone.setup(ship,at,Vector3(1.6,1.3,1.8),func(amount,point):
				if subsystem=="engine": engine_health-=maxf(0,amount-4)
				else: weapon_health-=maxf(0,amount-2)
				if engine_health<=0 or weapon_health<=0:
					game.effects.explosion(point,0.4)
				)
	else:
		roster.seed=MMFRandom.hash_seed([game.session.seed_name,"radio-raids",int(raid_wave/2)])
		var bag=["revenant","warden","bastion","sovereign"]
		for i in range(3,0,-1):
			var j=roster.randi_range(0,i)
			var held=bag[i];bag[i]=bag[j];bag[j]=held
		for i in 2:
			var kind_id="raider" if tutorial else bag[(raid_wave%2)*2+i]
			var enemy=spawn(kind_id,ship.position+Vector3(0,1.6,i*2-1),true)
			crew.append(enemy)
	game.session.notify("%s APPROACHING — %s SIDE" % [kind.to_upper(),"STARBOARD" if ship_side==1 else "PORT"])

func update(dt: float):
	enemies=enemies.filter(func(e):return is_instance_valid(e))
	if game.cinematic!="": return
	if nav_dirty:
		nav_delay-=dt
		if nav_delay<=0 and not nav.is_baking(): nav.bake_navigation_mesh(true);nav_dirty=false
	mission.update(dt)
	var state=game.session
	update_director(dt)
	if ship_state!="none": update_ship(dt)
	for i in range(shells.size()-1,-1,-1):
		var shell=shells[i]
		shell.time-=dt
		if shell.time<=0:
			game.effects.explosion(shell.target,0.45)
			if game.player.position.distance_to(shell.target)<2.0: game.player.take_damage(shell.damage,shell.target)
			for p in game.session.structures:
				if game.building.center(p.cell).distance_to(shell.target)<2.0: game.building.damage(p.instanceId,shell.damage,shell.target)
			shell.marker.queue_free()
			shells.remove_at(i)
	loot_view.update()
	for i in range(loot.size()-1,-1,-1):
		var item=loot[i]
		if item.node.position.distance_to(game.player.position)<1.7:
			var before=int(item.count)
			item.count=state.add_resource(item.id,item.count)
			if game.ui:game.ui.loot_readout.record(item.id,before-int(item.count))
			if item.count==0:
				item.node.queue_free()
				loot.remove_at(i)
	# Hide collected instances in the same update that transfers their resources.
	if loot_view.previous_count!=loot.size():loot_view.update()
	update_turrets(dt)
	if encounter_had_enemies and not active_threat() and ship_state=="none":
		encounter_had_enemies=false
		state.facts.defenses+=1
		if "manual-turret" not in state.unlocks: state.unlocks.append("manual-turret")
		if state.story.phase=="raids": state.story.phase="route-selection"
		state.threat.phase="recovery"
		state.threat.remaining=250
		state.threat.warning=false
		state.notify("Deck secure. Recovery interval — radio trace available.")

func update_director(dt: float):
	var s=game.session
	if not s.opening_done: return
	if not s.facts.get("tutorialStarted",false) and s.facts.defenses==0:
		var turret={}
		for p in s.structures:
			if p.definitionId=="turret-manual": turret=p;break
		if not turret.is_empty() and s.facts.get("defenseCrewed",false) and s.scanner.phase=="consumed":
			s.threat.tutorialWait=s.threat.get("tutorialWait",0.0)+dt
			if s.threat.tutorialWait>=15 and not active_threat() and ship_state=="none" and not game.menu_open and s.scanner.phase not in ["scanning","pending"]:
				s.facts.tutorialStarted=true;begin_ship("skiff",true);return
	if s.scanner.phase!="consumed": return
	var t=s.threat
	var optional=s.contacts.active
	var sanctuary=s.story.phase in ["docked","braking","ending-journey","arrival"] or (optional.get("state","") in ["committed","docked","visited"] and optional.atDistanceM-s.distance<70)
	if sanctuary:
		t.sanctuary=true
		return
	if t.get("sanctuary",false):
		t.sanctuary=false;t.phase="sanctuary-release";t.remaining=300
	if active_threat() or ship_state!="none": return
	var safe=s.health>=35 and game.aboard() and not game.menu_open and s.clock>=game.journey.quiet_until
	if safe: t.legacy=maxf(0,t.get("legacy",24.0)-dt)
	t.remaining=maxf(0,t.remaining-s.speed*dt)
	if t.remaining>0: return
	if t.phase=="recovery":
		var rng=MMFRandom.new();rng.seed=MMFRandom.hash_seed([s.seed_name,"threat-director"])
		var draw=0.0
		for i in int(t.get("draws",0))+1: draw=rng.randf()
		t.draws=t.get("draws",0)+1;t.phase="calm";t.remaining=400+draw*700
	elif t.phase=="sanctuary-release": t.phase="calm";t.remaining=400
	elif t.phase=="calm" and safe and t.legacy<=0:
		t.phase="buildup";t.remaining=140;t.warning=true
		s.notify("Radio warning: boarding craft closing on the Nomad.")
	elif t.phase=="buildup" and safe and t.legacy<=0:
		t.phase="engagement";begin_ship("skiff",false,true)

func update_ship(dt: float):
	ship_timer+=dt
	if ship_state=="approach":
		ship.position=ship.position.move_toward(Vector3(ship_side*(18 if ship_kind=="gunboat" else 17),6,0),8*dt)
		for i in crew.size():
			if is_instance_valid(crew[i]) and not crew[i].dead: crew[i].position=ship.position+Vector3(0,1.6,i*2-1)
		if ship.position.z>=-0.1:
			ship_state="attack" if ship_kind=="gunboat" else "grapple"
			ship_timer=0
			if ship_state=="grapple":
				hook=MMFHitZone.new()
				hook.label=game.hint("Hold {key:use} to cut grapple")
				hook.setup(self,Vector3(ship_side*11.6,16.25,0),Vector3(0.5,0.5,0.5),func(amount,point):
					hook_health-=amount
					if hook_health<=0: cut_hook(point))
				var hook_model=MMFAssets.scene("models/authored/forged-hook.glb")
				hook.add_child(hook_model)
				game.audio.play_at("hook-catch",hook.global_position,.3)
	elif ship_state=="grapple":
		if hook and is_instance_valid(hook):
			game.effects.tracer(ship.position+Vector3.UP*2,hook.position,Color(0.15,0.13,0.1))
		for i in crew.size():
			var enemy=crew[i]
			if not is_instance_valid(enemy) or enemy.dead or not enemy.inactive: continue
			var t=clampf((ship_timer-(1 if tutorial_ship else 2)-i*(2.25 if tutorial_ship else 1.5))/3.5,0,1)
			enemy.position=(ship.position+Vector3(0,1.6,i*2-1)).lerp(Vector3(ship_side*10,16.1,i*2-1),t)
			enemy.play("walk")
			if t>=1:
				enemy.inactive=false
				if i==0 and not tutorial_ship: mission.assign(enemy,raid_wave+1)
		if ship_timer>10 and not mission.extraction_active(): retreat_ship(false)
	elif ship_state=="retreat":
		ship.position.z+=dt*18
		if ship.position.z>90:
			ship.queue_free()
			ship=null
			ship_state="none"
			if hook and is_instance_valid(hook): hook.queue_free()
			hook=null
	if ship_kind=="gunboat" and ship_state=="attack" and weapon_health<=0:
		disabled_time+=dt
		if disabled_time>=(5 if engine_health<=0 else 3): retreat_ship(false)
	if ship_state in ["attack","grapple"] and weapon_health>0:
		volley_timer-=dt
		if ship_kind=="gunboat" and volley_timer<1.2:
			game.effects.tracer(ship.position+Vector3(0,3.6,-3.5),game.player.position+Vector3.UP,Color(0.8,0.35,0.08))
		if volley_timer<=0:
			volley_timer=4 if ship_kind=="gunboat" else 3.5
			var shot_count=2 if ship_kind=="gunboat" or tutorial_ship else 3
			for i in shot_count:
				var target=game.player.position+Vector3((i-1)*0.7,0,0)
				var marker=game.effects.warning_ring(target)
				shells.append({"target":target,"time":(0.9 if ship_kind=="gunboat" else 0.8)+i*0.14,"damage":10 if ship_kind=="gunboat" else 8 if tutorial_ship else 12,"marker":marker})

func cut_hook(point: Vector3):
	game.effects.impact(point,Vector3.UP)
	for enemy in crew:
		if is_instance_valid(enemy) and enemy.inactive: enemy.take_damage(10000,enemy.position)
	retreat_ship(false)
	game.session.notify("Grapple severed.")

func destroy_ship(point: Vector3):
	if ship_state=="retreat": return
	game.effects.explosion(point,2)
	game.audio.cue(45,0.65,-15,true)
	for enemy in crew:
		if is_instance_valid(enemy) and enemy.inactive: enemy.take_damage(10000,enemy.position)
	retreat_ship(true)

func retreat_ship(destroyed: bool):
	if ship_state=="retreat": return
	ship_state="retreat"
	game.session.add_resource("scrap",45 if destroyed and ship_kind=="gunboat" else 30)
	game.session.add_resource("components",3 if destroyed and ship_kind=="gunboat" else 2)
	for zone in MMFAssets.of_type(ship,"StaticBody3D"): zone.collision_layer=0
	encounter_had_enemies=true

func drop_loot(at: Vector3,id: String,count: int):
	if count<=0 or not game.data.ITEMS.has(id):return
	var node=Node3D.new();node.name="Recovered_"+id;add_child(node);node.position=at+Vector3.UP*.2
	var item={"node":node,"id":id,"count":count}
	loot_view.place(item);loot.append(item)

func killed(enemy): mission.recover(enemy)

func layout_changed():
	loot_view.invalidate()
	nav_dirty=true;nav_delay=0.3
	var bounds=AABB(Vector3(-20,7,-20),Vector3(40,20,40))
	for p in game.session.structures:
		var at=game.building.center(p.cell)
		bounds=bounds.expand(at+Vector3(2,5,2)).expand(at-Vector3(2,1,2))
	nav.navigation_mesh.filter_baking_aabb=bounds

func update_turrets(dt: float):
	var def=game.data.TURRETS["automatic-turret"]
	for p in game.session.structures:
		if p.definitionId!="turret-auto" or p.health<=0 or not game.session.powered.get(p.instanceId,false): continue
		var at=game.building.center(p.cell)+Vector3.UP*1.4
		if not turret_aim.has(p.instanceId): turret_aim[p.instanceId]={"yaw":0.0,"pitch":0.0,"lock":0.0,"target":0,"clock":0.0}
		var aim=turret_aim[p.instanceId]
		aim.clock=maxf(0,aim.clock-dt)
		var selected=null
		var best=def.range
		for enemy in enemies:
			if not is_instance_valid(enemy) or enemy.dead or at.distance_to(enemy.position)>best: continue
			var target=enemy.position+Vector3.UP
			if not game.raycast(at,target,[],1).is_empty(): continue
			selected=enemy;best=at.distance_to(enemy.position)
		if selected==null: aim.lock=0;aim.target=0;continue
		if aim.target!=selected.get_instance_id(): aim.lock=0;aim.target=selected.get_instance_id()
		var delta=selected.position+Vector3.UP-at
		var base=-int(p.rotation)*PI/2
		var target_yaw=wrapf(atan2(-delta.x,-delta.z)-base,-PI,PI)
		var target_pitch=atan2(delta.y,Vector2(delta.x,delta.z).length())
		if target_pitch<def.traverse.pitchMin or target_pitch>def.traverse.pitchMax: aim.lock=0;continue
		aim.yaw+=clampf(wrapf(target_yaw-aim.yaw,-PI,PI),-def.yawSpeed*dt,def.yawSpeed*dt)
		aim.pitch=move_toward(aim.pitch,target_pitch,def.pitchSpeed*dt)
		var body=game.building.bodies.get(p.instanceId)
		if body:
			var yaw_node=MMFAssets.find_named(body,"TurretYaw");var pitch_node=MMFAssets.find_named(body,"TurretPitch")
			if yaw_node: yaw_node.rotation.y=aim.yaw
			if pitch_node: pitch_node.rotation.x=aim.pitch
		var aligned=absf(wrapf(target_yaw-aim.yaw,-PI,PI))<def.aimTolerance and absf(target_pitch-aim.pitch)<def.aimTolerance
		aim.lock=aim.lock+dt if aligned else 0.0
		if aim.lock>=def.lockDelay and aim.clock<=0:
			var mods=game.session.modifiers()
			selected.take_damage(def.damage*mods.turretDamageMultiplier,selected.position+Vector3.UP)
			game.effects.tracer(at,selected.position+Vector3.UP,Color(0.2,0.8,1))
			aim.clock=1.0/(def.fireRate*mods.turretRateMultiplier)

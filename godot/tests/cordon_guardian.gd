extends SceneTree

var game
var checks=0
var failures=[]
var captures=[]

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://cordon-guardian-tests/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func frames(n: int=3):
	for i in n:await process_frame

func fresh():
	check(game.playtests.launch("gatekeeper"),"Isolated guardian checkpoint launches")
	game.set_physics_process(false);game.player.set_physics_process(false);game.player.hit_grace=1000
	await frames(4)
	game.session.distance+=21;game.campaign.update(.1)
	check(game.combat.guardian.enabled and game.session.story.scripted=="queued","Real route threshold launches one named guardian")
	game.close_menu();game.combat.update_ship(game.combat.approach_duration)
	# A large approach step creates only the first lock/salvo cycle, never catch-up attacks.
	check(game.combat.guardian.volleys<=1,"Large approach delta cannot emit catch-up bursts")

func tick(seconds: float):
	for i in int(ceil(seconds/.1)):
		game.combat.update(.1);game.campaign.update(.1)

func advance_to(phase: String):
	for i in 200:
		if game.combat.guardian.phase==phase:return
		game.combat.update(.1)
	check(false,"Reach guardian phase "+phase)

func target(id: String):
	for zone in game.combat.ship_targets:
		if zone.get_meta("ship_component","")==id:return zone
	return null

func meshes_inside_target(kit: Node3D,zone: MMFHitZone) -> bool:
	var size=zone.get_child(0).shape.size
	var region=AABB(-size*.5,size).grow(.002)
	for mesh in MMFAssets.of_type(kit,"MeshInstance3D"):
		var relative=zone.global_transform.affine_inverse()*mesh.global_transform
		for surface in mesh.mesh.get_surface_count():
			for vertex in mesh.mesh.surface_get_arrays(surface)[Mesh.ARRAY_VERTEX]:
				if not region.has_point(relative*vertex):return false
	return true

func capture(name: String):
	if DisplayServer.get_name()=="headless":return
	game.player.position=Vector3(-5,16.1,5) if name=="salvo" else Vector3(7,16.1,-3)
	game.player.yaw=-PI/3 if name=="salvo" else -PI/2
	game.player.pitch=-.2 if name=="salvo" else -.05;game.player.update_camera(1)
	game.combat.update_ship(0)
	await frames(6);await RenderingServer.frame_post_draw
	var path="res://../test-results/gatekeeper-"+name+".png"
	root.get_texture().get_image().save_png(path);captures.append(path)

func run():
	Engine.max_fps=60
	if DisplayServer.get_name()!="headless":DisplayServer.window_set_size(Vector2i(1440,900))
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.set_physics_process(false);game.player.set_physics_process(false);await frames(5)
	# This suite tests the encounter after title preparation, not the immediate
	# cold-load handoff. Let the owned background resource work finish first.
	var prepare_deadline=Time.get_ticks_msec()+30000
	while not game.get_node("EncounterAssets").finished and Time.get_ticks_msec()<prepare_deadline:await process_frame
	check(game.get_node("EncounterAssets").finished,"Existing title resource preparation finishes before the encounter fixture")
	await frames(2)
	var fixture=game.playtests.payload("gatekeeper")
	check(MMFSession.new(game.data).restore_native(fixture.session),"Guardian checkpoint validates without new save schema")
	check(MMFCordonGuardian.route_label(game.data.MERIDIAN_ROUTES[1]).contains("Gatekeeper"),"Helm identifies the guardian before route commitment")
	check(not MMFCordonGuardian.route_label(game.data.MERIDIAN_ROUTES[0]).contains("Gatekeeper"),"Other Meridian route remains ordinary skiff route")
	await fresh()
	var c=game.combat;var g=c.guardian;var s=game.session
	check(c.ship_kind=="gunboat" and c.ship_health==420 and c.crew.is_empty(),"Guardian retains authored gunboat silhouette, health and no surprise boarders")
	check(is_instance_valid(g.presentation.hull_kit) and is_instance_valid(g.presentation.gun_kit) and g.presentation.shutters.size()==2,"Signature hardware is attached to the retained hull and actual recoil assembly")
	check(g.presentation.hull_kit.get_parent()==c.ship and g.presentation.gun_kit.get_parent()==c.craft.recoil,"Fitted guardian hardware follows the original carrier and gun mechanics")
	check(meshes_inside_target(g.presentation.gun_kit,target("weapon")),"Closed shutter and pressure-instrument geometry stays inside the retained physical fire-control hit volume")
	check(not game.safe_to_save(),"Live guardian blocks transient saves")
	var wave=c.raid_wave;game.campaign.update(.1)
	check(c.raid_wave==wave and g.enabled,"Repeated route callbacks do not spawn a second guardian")
	advance_to("salvo")
	check(c.shells.size()==3 and g.volleys==1,"Lock produces exactly one three-mark salvo")
	var marks=c.shells.map(func(shell):return shell.target)
	game.player.position=Vector3(-7,16.1,-5);c.update(.1)
	check(c.shells.map(func(shell):return shell.target)==marks,"Salvo marks remain fixed after the player dodges")
	check(c.shells.all(func(shell):return shell.time>0),"Marked shots retain a visible warning interval")
	check(c.shells.all(func(shell):return is_equal_approx(shell.marker.mesh.get_aabb().size.x*shell.marker.scale.x,4.0)),"Ground warning diameters match the actual four-metre blast footprint")
	await capture("salvo")
	advance_to("cooling")
	var weapon=target("weapon")
	check(c.shells.is_empty() and weapon.armor==0,"Cooling begins after impacts and removes actual fire-control armor")
	c.update(.3)
	check(g.presentation.opening==1 and g.presentation.shutters.all(func(hinge):return absf(hinge.rotation.y)>1.7),"Real vulnerability opens both supported mechanical shutters")
	check(meshes_inside_target(g.presentation.gun_kit,weapon),"Open shutters and pressure instrument remain inside the real vulnerable hit volume")
	var health=c.weapon_health;weapon.take_weapon_damage(20,weapon.global_position,0,100,1)
	check(is_equal_approx(health-c.weapon_health,35),"Ordinary weapon damage receives the exposed-subsystem multiplier")
	check(c.craft.weapon_lenses.all(func(material):return material.albedo_color.g>.8 and material.albedo_color.b>.7),"Visible gun lenses turn cyan in the vulnerability window")
	await frames(2)
	game.player.position=Vector3(7,16.1,-3)
	var hit=game.raycast(game.player.position+Vector3.UP*1.4,weapon.global_position,[],4)
	check(not hit.is_empty() and hit.collider==weapon,"Personal-gun ray physically reaches the named weapon subsystem")
	await capture("cooling")
	advance_to("lock");health=c.weapon_health;weapon.take_weapon_damage(20,weapon.global_position,0,100,1)
	check(weapon.armor==10 and is_equal_approx(health-c.weapon_health,10),"Outside cooling the same actual target has armored damage")
	advance_to("salvo");weapon.take_damage(10000,weapon.global_position);c.update(.1)
	check(c.weapon_health==0 and c.shells.is_empty(),"Disabling fire-control cancels all pending marked damage")
	tick(3.1)
	check(c.ship_state=="retreat" and c.active_threat() and not game.safe_to_save(),"Disarmed withdrawal stays live and unsavable until the carrier leaves")
	tick(6.2)
	check(c.ship_state=="none" and not c.active_threat() and s.story.scripted=="resolved","Disarming completes the real carrier lifecycle and route receipt")
	check(s.facts.get("guardianOutcome","")=="disarmed","Disarm resolution records the durable G-01 cosmetic entitlement")
	check(s.threat.remaining>=649 and game.journey.quiet_until>=s.clock+74,"Resolved guardian grants salvage/service recovery distance and quiet time")
	check(game.journey.queue.any(func(entry):return entry.id=="narrative/gatekeeper-cleared"),"Resolution queues a connected story acknowledgment")
	check(game.safe_to_save() and game.save_game("gatekeeper-cleared"),"Resolved guardian creates a real durable checkpoint")
	var saved=MMFSaves.read("gatekeeper-cleared");game.load_payload(saved);await frames(4);game.campaign.update(.1)
	check(not c.guardian.enabled and c.ship_state=="none" and game.session.story.scripted=="resolved","Save/reload preserves resolution without replaying guardian or rewards")
	check(game.session.facts.get("guardianOutcome","")=="disarmed" and not game.session.complete_guardian("destroyed"),"Reloaded cosmetic receipt is stable and cannot be awarded again under another outcome")
	await fresh();c=game.combat;g=c.guardian
	advance_to("salvo");check(c.scout.deploy_decoy(),"Supplied ordinary decoy remains a no-gun escape")
	c.update(.1);check(c.shells.is_empty(),"Tracking disruption cancels the locked salvo immediately")
	tick(10)
	check(not c.active_threat() and c.ship_state=="none" and game.session.story.scripted=="resolved","Decoy resolves only after pursuit and ship have actually cleared")
	check(game.session.facts.get("guardianOutcome","")=="evaded" and not c.rewards_issued,"Decoy earns the same service mark without granting destroyed-hull cargo")
	await fresh();c=game.combat;g=c.guardian
	advance_to("salvo");var count=g.volleys;game.session.health=0;c.update(.1)
	check(c.shells.is_empty() and g.phase=="lock" and c.active_threat(),"Death clears marked shots without awarding escape")
	c.update(15);check(g.volleys==count,"Dead player cannot accumulate salvo bursts")
	game.session.health=100;c.update(.1)
	check(g.phase=="lock" and g.remaining>2.8,"Recovery gets a fresh readable lock window")
	c.engine_health=0;advance_to("cooling")
	check(g.remaining>8.8,"Destroyed engine extends the next real vulnerability window")
	c.update(40);check(g.phase=="lock" and g.volleys==count+1,"Coarse cooling update cannot cascade multiple attacks")
	c.destroy_ship(c.ship.position);tick(5)
	check(game.session.story.scripted=="resolved" and not c.active_threat(),"Hull destruction also resolves the route")
	check(game.session.facts.get("guardianOutcome","")=="destroyed","Hull victory also grants the durable service mark")
	var before=game.session.native_snapshot();c.issue_ship_rewards(true)
	check(before==game.session.native_snapshot(),"Repeated reward callback cannot grant additional guardian cargo")
	# Escalation is earned by both time and actual damage, with longer readable
	# windows and a longer answer window. The ordinary opening remains unchanged.
	await fresh();c=game.combat;g=c.guardian
	c.ship_health=200;g.completed_cycles=1;g.begin_lock()
	check(g.pattern=="line" and g.remaining==3,"Damage alone does not skip the introductory two cycles")
	g.completed_cycles=2;c.ship_health=300;g.begin_lock()
	check(g.pattern=="line","Completed cycles alone do not escalate an undamaged hull")
	c.ship_health=200;g.begin_lock();var cue_before=g.presentation.transition_cues
	c.update(.01)
	check(g.pattern=="cross" and g.remaining>3.9 and g.status_text().contains("CROSS"),"Damaged veteran cycle announces its longer cross-pattern lock")
	for i in 5:c.update(.01)
	check(g.presentation.transition_cues<=cue_before+1,"Held lock does not repeatedly allocate or play its transition cue")
	advance_to("salvo");marks=c.shells.map(func(shell):return shell.target)
	check(c.shells.size()==5 and c.shells.all(func(shell):return shell.time>=1.8),"Escalated salvo commits five supported marks with a longer warning")
	game.player.position+=Vector3(4,0,4);c.update(.1)
	check(c.shells.map(func(shell):return shell.target)==marks,"Cross pattern also stays fixed after a diagonal dodge")
	check(g.committed_target!=game.player.position+Vector3.UP,"Gun presentation retains committed salvo aim after the dodge")
	advance_to("cooling")
	check(c.shells.is_empty() and g.remaining>7.4,"Cross cooling starts only after every impact and grants the longer counterattack window")
	c.update(20);check(g.pattern=="line" and g.phase=="lock","Escalation alternates with the original pattern rather than a constant broad barrage")
	g.completed_cycles=4;c.engine_health=0;g.begin_lock();advance_to("salvo");advance_to("cooling")
	check(g.remaining>10.4,"Engine counterplay also extends the escalated cooling window")
	await fresh();c=game.combat;g=c.guardian
	g.finish()
	check(game.session.facts.get("guardianOutcome","")=="" and game.session.story.scripted=="queued","Unexpected unfinished cleanup cannot mint a victory or cosmetic receipt")
	game.load_payload(fixture);await frames(4)
	check(not c.guardian.enabled and c.shells.is_empty() and c.guardian.recovery==0,"Loading a pre-encounter save clears all transient guardian state")
	game.session.story.routeId="meridian-quiet-line";game.session.story.arrival=game.session.distance+500;game.campaign.update(.1)
	check(c.ship_kind=="skiff" and not c.guardian.enabled,"Quiet-line branch still launches its existing ordinary patrol")
	game.load_payload(fixture);await frames(3)
	await finish()

func finish():
	var report={"checks":checks,"failures":failures,"captures":captures,"human_playthrough":false,"scope":"Controlled native gameplay/physical target/save regression; natural difficulty and comprehension remain unverified."}
	var file=FileAccess.open("res://../test-results/beta-next/cordon-guardian-"+("headless" if DisplayServer.get_name()=="headless" else "native")+".json",FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"  "));file.close();print("CORDON_GUARDIAN_RESULT ",JSON.stringify(report))
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs)
	# Return through the awaited helper and release run() locals before renderer
	# teardown, matching the existing story/physical-parity harnesses.
	call_deferred("quit",0 if failures.is_empty() else 1)

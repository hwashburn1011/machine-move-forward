extends SceneTree

# Source-catalog compatibility and live salvage/reload behavior, not pacing.
const RETIRED=["craft-rifle-ammo","craft-shotgun-ammo"]
const HEAVY_CONTENTS={"scrap":48,"components":8,"fuel":4}
var game
var checks=0
var failures=[]
var source_start=""

func _initialize():
	set_meta("test_mode",true)
	MMFSaves.DIRECTORY="user://native-resource-refinements-tests/"
	call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func frames(n: int=3):
	for i in n:await physics_frame

func same_json(a,b) -> bool:
	# JSON restores integral values as floats; compare the complete durable data.
	return JSON.parse_string(JSON.stringify(a))==JSON.parse_string(JSON.stringify(b))

func catalog():
	var raw=JSON.parse_string(FileAccess.get_file_as_string("res://data/definitions.json"))
	var expected=raw.RECIPES.filter(func(r):return r.id in ["craft-scanner-replacement-module","refine-components","craft-repair-kit","craft-extended-mag"])
	var actual=game.data.RECIPES.filter(func(r):return r.id!="craft-signal-decoy")
	check(actual==expected,"Native catalog retains all four useful exported recipes and their exact bills/outputs")
	var decoy=game.data.RECIPES.filter(func(r):return r.id=="craft-signal-decoy")
	check(decoy.size()==1 and decoy[0].inputs=={"scrap":4,"components":2} and decoy[0].output=={"itemId":"signal-decoy","count":1},"Native decoy recipe remains available at its original price")
	check(game.data.ITEMS["ammo-rifle"]==raw.ITEMS["ammo-rifle"] and game.data.ITEMS["ammo-shotgun"]==raw.ITEMS["ammo-shotgun"],"Legacy ammo definitions and stack limits remain unchanged")
	var repeated=game.data.duplicate(true)
	MMFNativeProgression.apply(repeated);MMFNativeProgression.apply(repeated)
	check(repeated.RECIPES==game.data.RECIPES,"Repeated native setup does not alter the retained catalog")
	var s=MMFSession.new(game.data)
	var bench=s.create_piece("workbench",{"x":0,"y":0,"z":0},0,{},true)
	s.inventory.add("components",20);s.update_power()
	for id in RETIRED:
		var before=s.native_snapshot()
		check(not s.craft(id,1,bench.instanceId) and s.native_snapshot()==before,"Retired craft cannot spend or mutate stock: "+id)
	var events=[]
	s.transaction.connect(func(event,details):events.append({"event":event,"details":details}))
	for id in ["craft-scanner-replacement-module","craft-repair-kit","craft-signal-decoy"]:
		var recipe=game.data.RECIPES.filter(func(r):return r.id==id)[0]
		var before={}
		for item in recipe.inputs:before[item]=s.count_resource(item)
		var output_before=s.count_resource(recipe.output.itemId)
		var made=s.craft(id,1,bench.instanceId)
		check(made and recipe.inputs.keys().all(func(item):return s.count_resource(item)==before[item]-recipe.inputs[item]) and s.count_resource(recipe.output.itemId)==output_before+recipe.output.count,"Retained craft uses its real transaction: "+id)
	check(events.size()==3 and events.all(func(e):return e.event=="crafted" and e.details.batches==1),"Retained recipes emit one ordinary transaction each")

func migration():
	var source=MMFSession.new(game.data)
	source.inventory.add("ammo-rifle",7);source.inventory.add("ammo-shotgun",3)
	var crate=source.create_piece("crate",{"x":0,"y":0,"z":0},0,{},true)
	source.stores[crate.instanceId].add("ammo-rifle",5);source.stores[crate.instanceId].add("ammo-shotgun",2)
	source.weapons.rifle.ammoInMag=1;source.weapons.rifle.reserveAmmo=0
	source.weapons.shotgun.ammoInMag=2;source.weapons.shotgun.reserveAmmo=7
	var base=source.native_snapshot()
	for id in RETIRED:
		var old=base.duplicate(true);old.polish.pin={"kind":"recipe","id":id}
		var input_before=old.duplicate(true);var loaded=MMFSession.new(game.data)
		check(loaded.restore_native(JSON.parse_string(JSON.stringify(old))),"Old ammo recipe pin is accepted by full save validation: "+id)
		var expected=base.duplicate(true);expected.polish.pin={}
		check(same_json(loaded.native_snapshot(),expected) and old==input_before,"Migration only clears the obsolete pin and never mutates caller data: "+id)
		if not same_json(loaded.native_snapshot(),expected):
			for key in expected:
				if not same_json(loaded.native_snapshot().get(key),expected[key]):print("MIGRATION_DIFF ",key," actual=",loaded.native_snapshot().get(key)," expected=",expected[key])
		var next=MMFSession.new(game.data)
		check(next.restore_native(JSON.parse_string(JSON.stringify(loaded.native_snapshot()))) and next.native_snapshot()==loaded.native_snapshot(),"Migrated ammo stocks and weapon state survive a second JSON round trip: "+id)
	for pin in [{"kind":"recipe","id":"craft-repair-kit"},{"kind":"build","id":"crate"}]:
		var old=base.duplicate(true);old.polish.pin=pin
		var loaded=MMFSession.new(game.data)
		check(loaded.restore_native(old) and loaded.polish.pin==pin,"Current recipe/build pin survives unchanged: "+pin.id)
	var invalid_pins=[{"kind":"recipe","id":"unknown-recipe"},{"kind":"build","id":RETIRED[0]},{"kind":"recipe","id":4},{"kind":"recipe","id":RETIRED[0],"extra":true},["recipe",RETIRED[0]],{"kind":"recipe"}]
	var loaded=MMFSession.new(game.data)
	for i in invalid_pins.size():
		var bad=base.duplicate(true);bad.polish.pin=invalid_pins[i]
		var before=loaded.native_snapshot()
		check(not loaded.restore_native(bad) and loaded.native_snapshot()==before,"Malformed or unknown pin rejected atomically: "+str(i))
	for section in ["inventory","activities"]:
		var bad=base.duplicate(true);bad.polish.pin={"kind":"recipe","id":RETIRED[0]}
		if section=="inventory":bad.inventory[0]={"itemId":"unknown-item","count":1}
		else:bad.polish.activities=[]
		var before=loaded.native_snapshot()
		check(not loaded.restore_native(bad) and loaded.native_snapshot()==before,"Legacy pin exception never masks invalid "+section)
	for id in RETIRED:
		var before=game.session.native_snapshot()
		game.guidance.toggle_pin("recipe",id)
		check(game.session.native_snapshot()==before,"Unavailable recipe cannot be newly pinned: "+id)
	var loot=[{"id":"ammo-rifle","count":7,"position":{"x":0,"y":16.3,"z":0}},{"id":"ammo-shotgun","count":3,"position":{"x":1,"y":16.3,"z":0}}]
	check(MMFLootView.valid_snapshot(loot,game.data.ITEMS),"Saved world ammunition retains valid item identities")
	game.combat.loot_view.restore(loot)
	var restored_loot=game.combat.loot_view.snapshot()
	check(restored_loot.size()==loot.size() and range(loot.size()).all(func(i):return restored_loot[i].id==loot[i].id and restored_loot[i].count==loot[i].count and MMFAssets.v(restored_loot[i].position).is_equal_approx(MMFAssets.v(loot[i].position))),"World ammo restoration preserves both uncollected stacks and positions")

func workshop_ui():
	var s=game.session
	var bench=s.create_piece("workbench",{"x":3,"y":0,"z":5},0,{},true)
	game.building.add_visual(bench);s.update_power()
	game.player.teleport(Vector3(0,16.1,-1))
	for id in RETIRED:
		game.ui.workshop_view.category="CRAFT";game.ui.workshop_view.selected=id
		game.open_station("Workshop","workbench",bench.instanceId)
		await frames()
		var rows=game.ui.content.find_children("*","Button",true,false).filter(func(b):return b.has_meta("terminal_entry"))
		check(not rows.is_empty() and rows.all(func(b):return b.get_meta("terminal_entry") not in RETIRED),"Actual workbench excludes unavailable ammo recipes: "+id)
		check(game.ui.workshop_view.selected not in RETIRED and game.data.RECIPES.any(func(r):return r.id==game.ui.workshop_view.selected),"Stale workbench selection falls back to a valid recipe: "+id)
	game.close_menu()

func reload_preservation():
	var s=game.session;var player=game.player
	game.close_menu();game.building.cancel();player.teleport(Vector3(0,16.1,-1))
	player.restore_placement_frames=0
	for with_stock in [false,true]:
		if with_stock:s.inventory.add("ammo-rifle",7);s.inventory.add("ammo-shotgun",3)
		for weapon in ["rifle","shotgun"]:
			s.current_weapon=weapon;var gun=s.weapons[weapon]
			gun.ammoInMag=0;gun.reserveAmmo=0;gun.magazineBonus=0;gun.attachment=""
			player.reload_left=0
			var inventory_before=s.inventory.slots.duplicate(true)
			player.reload_weapon()
			var duration=player.reload_left
			check(is_equal_approx(duration,game.data.WEAPONS[weapon].reloadTime),"Reload uses ordinary duration: "+weapon+" stock="+str(with_stock))
			# Real player update path, deterministic elapsed time; no fabricated ammo grant.
			player._physics_process(duration*.5)
			check(gun.ammoInMag==0 and player.reload_left>0,"Reload cannot refill before its completion: "+weapon+" stock="+str(with_stock))
			player._physics_process(duration*.5+.001)
			check(gun.ammoInMag==game.data.WEAPONS[weapon].magazineSize and gun.reserveAmmo==0 and s.inventory.slots==inventory_before,"Ordinary reload refills without consuming legacy stock or reserve: "+weapon+" stock="+str(with_stock))

func clear_cargo():
	for c in game.salvage.crates:
		c.active=false;c.claimed="";c.contents={};c.opened=false;c.elevated=false
		game.salvage.set_heavy(c,false);c.node.hide()

func expect_stream(heavy: bool,label: String):
	clear_cargo();game.salvage.spawn()
	var active=game.salvage.crates.filter(func(c):return c.active)
	check(active.size()==1 and active[0].heavy==heavy and active[0].elevated==false,label)
	if active.size()==1:
		check(active[0].contents==HEAVY_CONTENTS if heavy else (not active[0].opened and active[0].contents.is_empty()),"Stream cargo retains its normal payload contract: "+label)

func stream():
	var s=game.session
	s.distance=360;s.expedition_gear.recovered=[];s.fuel=60;s.update_power()
	expect_stream(false,"No crane recovery keeps fourth opportunity hookable")
	s.expedition_gear.recovered=["salvage-crane"];s.update_power()
	expect_stream(false,"Recovery without installation keeps fourth opportunity hookable")
	var crane=s.create_piece("salvage-crane",{"x":0,"y":0,"z":0},0,{},true)
	crane.health=0;s.update_power()
	expect_stream(false,"Destroyed installed crane keeps fourth opportunity hookable")
	crane.health=game.data.BUILD_PIECES["salvage-crane"].maxHealth;s.fuel=0;s.update_power()
	expect_stream(false,"Unpowered installed crane keeps fourth opportunity hookable")
	s.fuel=60;s.update_power();s.powered.erase(crane.instanceId)
	expect_stream(false,"Absent explicit power result never enables heavy stream cargo")
	s.update_power()
	expect_stream(true,"Recovered healthy powered crane enables fourth heavy opportunity")
	for distance in [90,180,270]:
		s.distance=distance;expect_stream(false,"Non-fourth opportunity remains ordinary at "+str(distance))
	s.distance=360
	var second=s.create_piece("salvage-crane",{"x":1,"y":0,"z":0},0,{},true)
	crane.health=0;s.update_power()
	expect_stream(true,"One healthy powered crane suffices among damaged equipment")
	second.health=0;s.update_power()
	expect_stream(false,"All damaged cranes stop future heavy replacements")
	second.health=game.data.BUILD_PIECES["salvage-crane"].maxHealth;s.update_power()
	expect_stream(true,"Repair restores eligibility without changing rewards")
	var existing=game.salvage.snapshot()
	s.structures.erase(crane);s.structures.erase(second);s.update_power()
	check(game.salvage.snapshot()==existing,"Removing the crane does not rewrite already spawned heavy cargo")
	# Keep existing cargo and exercise the real next spawn into another pool slot.
	game.salvage.spawn()
	check(game.salvage.crates.filter(func(c):return c.active and c.heavy).size()==1 and game.salvage.crates.filter(func(c):return c.active and not c.heavy).size()==1,"Crane removal changes only future ordinary-stream opportunities")
	clear_cargo()
	for i in game.salvage.crates.size():game.salvage.spawn()
	var full=game.salvage.snapshot();game.salvage.spawn()
	check(game.salvage.snapshot()==full,"Full cargo pool never overwrites a pending load")
	var restored=[{"position":{"x":20,"y":2,"z":-20},"contents":HEAVY_CONTENTS.duplicate(),"opened":true,"claimed":"","heavy":true,"elevated":false},{"position":{"x":21,"y":16.13,"z":2},"contents":{"scrap":9,"components":2,"fuel":1},"opened":true,"claimed":"","heavy":true,"elevated":true}]
	clear_cargo();game.salvage.restore(JSON.parse_string(JSON.stringify(restored)))
	check(game.salvage.crates[0].active and game.salvage.crates[0].heavy and not game.salvage.crates[0].elevated and same_json(game.salvage.crates[0].contents,HEAVY_CONTENTS),"Legacy stream heavy cargo restores without installed crane")
	check(game.salvage.crates[1].active and game.salvage.crates[1].heavy and game.salvage.crates[1].elevated and same_json(game.salvage.crates[1].contents,restored[1].contents),"Partially collected elevated trial restores without reward replacement")

func recovery_trial():
	var s=game.session;var op=game.opportunities
	clear_cargo();s.expedition_gear.recovered=[];s.expedition_gear.sites={}
	s.story.completed=["wreck-one","relay-foundry","quiet-array"];s.story.phase="route-selection";s.story.index=3
	s.survivor_content.workshop.isolated=true;s.survivor_content.workshop.fuse=true;s.survivor_content.workshop.powered=true
	s.fuel=0;s.update_power()
	for i in game.salvage.crates.size():game.salvage.spawn()
	var before=game.salvage.snapshot()
	var c=op.make_contact(10);c.kind="gear-salvage-crane";c.state="docked";c.atDistanceM=s.distance
	s.contacts.active=c;op.create_site();await frames()
	var site=op.survivor_site
	for action in ["gear-isolate","gear-release","gear-recover"]:
		var point=op.points.filter(func(p):return p.id==action)[0]
		game.player.teleport(op.site.to_global(point.at)-Vector3.UP*.7);site.interact(action)
	check(s.expedition_gear.recovered==["salvage-crane"] and not MMFNativeProgression.available(s,"salvage-crane"),"Real local sequence recovers assembly without installation")
	check(not site.state().trialSpawned and game.salvage.snapshot()==before,"Full pool defers explicit recovery trial without losing existing cargo")
	game.salvage.crates[0].active=false;game.salvage.crates[0].node.hide();site.update()
	var trial=game.salvage.crates.filter(func(entry):return entry.active and entry.heavy)
	check(site.state().trialSpawned and trial.size()==1 and trial[0].elevated and trial[0].contents==HEAVY_CONTENTS,"Recovery trial appears when room opens despite no crane or power")
	var once=game.salvage.snapshot();site.update();site.interact("gear-recover")
	check(game.salvage.snapshot()==once and s.expedition_gear.recovered==["salvage-crane"],"Repeated recovery/update never duplicates trial or blueprint")
	clear_cargo();game.salvage.restore(JSON.parse_string(JSON.stringify(once)))
	check(game.salvage.crates.filter(func(entry):return entry.active and entry.heavy and entry.elevated).size()==1,"Actual recovery trial survives cargo JSON save/load before installation")

func run():
	source_start=MMFPlaytestRecorder.source_fingerprint()
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.session.opening_done=true;game.close_menu()
	game.set_physics_process(false);game.player.set_physics_process(false)
	await frames();catalog();migration();await workshop_ui();reload_preservation();stream();await recovery_trial()
	var source_end=MMFPlaytestRecorder.source_fingerprint()
	check(source_start==source_end,"Runtime sources remained stable during focused validation")
	var file=FileAccess.open("res://../docs/godot-port/results/native-resource-refinements-2026-09-28.json",FileAccess.WRITE)
	if file:file.store_string(JSON.stringify({"checks":checks,"failures":failures,"passed":failures.is_empty(),"source_hash":source_start,"source_hash_end":source_end,"human_test":false},"  "));file.close()
	game.open_menu("Pause")
	while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=preload("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs)
	quit(0 if failures.is_empty() else 1)

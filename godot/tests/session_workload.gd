extends SceneTree

var checks=0
var failures=[]

class Fixture extends Node3D:
	var session
	var player=Node3D.new()
	var data: Dictionary
	func aboard(): return true

func _initialize(): set_meta("test_mode",true);call_deferred("run")

func check(ok: bool,label: String):
	checks+=1;print("PASS " if ok else "FAIL ",label)
	if not ok: failures.append(label)

# Frozen consumer-list calculation from d0a6bcb: compare results across changes
# in fuel, generator damage, upgrades, consumers and the three fixed services.
func reference_power(session) -> Dictionary:
	var capacity=0.0;var demand=0.0;var powered={};var consumers=[]
	var draws={"lamp":1,"refinery":10,"condenser":4,"turret-manual":3,"collector-auto":4,"turret-auto":6,"caretaker-dock":3}
	var mods=session.modifiers()
	for p in session.structures:
		var id=p.definitionId
		if id=="generator" and session.fuel>0: capacity+=maxf(0,16+mods.generationBonus)*p.health/session.data.BUILD_PIECES[id].maxHealth
		if draws.has(id) and p.health>0:
			var priority=2 if id.begins_with("turret") else (0 if id=="lamp" else 1)
			var draw=draws[id]+(mods.turretPowerBonus if id.begins_with("turret") else 0)
			consumers.append({"id":p.instanceId,"draw":draw,"priority":priority});demand+=draw
	if session.facts.salvage:consumers.append({"id":"fixed-radio","draw":1,"priority":1});demand+=1
	if session.fieldwork_active:consumers.append({"id":"fixed-fieldwork","draw":1,"priority":1});demand+=1
	if "course-gyro" in session.story.uniques:consumers.append({"id":"fixed-helm","draw":1,"priority":1});demand+=1
	var total=demand;var enabled=[0,1,2]
	for priority in [0,1,2]:
		if total<=capacity:break
		enabled.erase(priority)
		for consumer in consumers:
			if consumer.priority==priority:total-=consumer.draw
	for consumer in consumers:powered[consumer.id]=consumer.priority in enabled
	return {"capacity":capacity,"demand":demand,"powered":powered}

func run():
	var data=MMFAssets.json("res://data/definitions.json")
	var rng=RandomNumberGenerator.new();rng.seed=6082026
	var session=MMFSession.new(data);session.structures.clear();session.stores.clear()
	var kinds=["floor","generator","lamp","refinery","condenser","turret-auto","turret-manual","collector-auto","caretaker-dock"]
	for i in 180:session.create_piece(kinds[i%kinds.size()],{"x":i%20,"y":0,"z":int(i/20)},0,{},true)
	var mismatches=[]
	for trial in 700:
		session.fuel=0 if trial%7==0 else 60
		session.facts.salvage=trial%2==0;session.fieldwork_active=trial%3==0
		session.story.uniques=["course-gyro"] if trial%5==0 else []
		session.research.active.clear()
		for id in data.UPGRADES:
			if rng.randf()<.35:session.research.active[data.UPGRADES[id].branch]=id
		for p in session.structures:
			p.health=data.BUILD_PIECES[p.definitionId].maxHealth*([0.0,.125,.5,1.0][rng.randi_range(0,3)])
		var expected=reference_power(session);session.update_power()
		if not is_equal_approx(session.capacity,expected.capacity) or not is_equal_approx(session.demand,expected.demand) or session.powered!=expected.powered:mismatches.append(trial)
	check(mismatches.is_empty(),"700 damaged/upgraded/powered layouts match original power allocation")
	check(session.powered.values().all(func(value):return value is bool),"Public power map contains only final booleans")
	session.structures.clear();session.research.active.clear();session.facts.salvage=false;session.fieldwork_active=false;session.story.uniques.clear();session.fuel=60
	var generator=session.create_piece("generator",{"x":0,"y":0,"z":0},0,{},true)
	var lamp=session.create_piece("lamp",{"x":1,"y":0,"z":0},0,{},true)
	var refinery=session.create_piece("refinery",{"x":2,"y":0,"z":0},0,{},true)
	var turret=session.create_piece("turret-auto",{"x":3,"y":0,"z":0},0,{},true)
	session.update_power()
	check(session.capacity==16 and session.demand==17 and not session.powered[lamp.instanceId] and session.powered[refinery.instanceId] and session.powered[turret.instanceId],"One-watt overload sheds lights and retains industry plus defense")
	generator.health*=.5;session.update_power()
	check(not session.powered[refinery.instanceId] and session.powered[turret.instanceId],"Damaged generator sheds industry before defense")
	session.structures.erase(turret);session.update_power()
	check(not session.powered.has(turret.instanceId),"Demolished consumer disappears immediately from power map")
	session.fuel=0;session.update_power()
	check(session.capacity==0 and session.powered.values().count(true)==0,"No fuel still removes all generated power")
	var fixture=Fixture.new();fixture.session=session;fixture.data=data;fixture.player.position=Vector3(0,16.1,0)
	var home=MMFHome.new();home.setup(fixture)
	session.structures.clear()
	session.create_piece("floor",{"x":0,"y":0,"z":0},0,{},true)
	session.create_piece("roof",{"x":0,"y":0,"z":0},0,{},true)
	var comfort=session.create_piece("rug",{"x":0,"y":0,"z":0},0,{},true)
	for edge in [{"x":0,"y":0,"z":0,"axis":"x"},{"x":-1,"y":0,"z":0,"axis":"x"},{"x":0,"y":0,"z":0,"axis":"z"},{"x":0,"y":0,"z":-1,"axis":"z"}]:session.create_piece("wall",{"x":0,"y":0,"z":0},0,edge,true)
	home.update(0)
	check(home.layout_matches() and home.room_at(Vector3(0,16.03,0)).enclosed and home.room_at(Vector3(0,16.03,0)).comfort,"Enclosed furnished room is recognized after first build")
	comfort.cell.x=1
	check(not home.layout_matches(),"In-place movement invalidates room layout")
	home.update(0)
	check(not home.room_at(Vector3(0,16.03,0)).comfort,"Moving the rug out removes room comfort")
	var wall=session.structures.back();wall.edge.z=-2
	check(not home.layout_matches(),"In-place edge movement invalidates room layout")
	home.update(0)
	check(not home.room_at(Vector3(0,16.03,0)).enclosed,"Moving a wall opens the shelter")
	wall.edge.z=-1;home.update(0);wall.definitionId="lamp"
	check(not home.layout_matches(),"Same-ID definition replacement invalidates room layout")
	home.update(0)
	check(not home.room_at(Vector3(0,16.03,0)).enclosed,"Replacing a wall with a lamp cannot leave stale shelter")
	wall.definitionId="wall";home.update(0)
	var replacement=session.structures.duplicate(true);replacement.back().edge.z=-2;session.structures=replacement
	check(not home.layout_matches(),"Same-count restored structures invalidate cached room layout")
	home.update(0);home.invalidate_layout()
	check(not home.layout_matches(),"Explicit load invalidation refreshes room and keepsake visuals")
	home.update(0);session.structures.clear();home.update(0)
	check(home.rooms.is_empty() and home.layout_snapshot.is_empty(),"Removing every piece releases cached room data")
	home.free();fixture.player.free();fixture.free()
	var report={"checks":checks,"powerLayouts":700,"failures":failures,"passed":failures.is_empty()}
	var file=FileAccess.open("res://../test-results/godot-native/session-workload.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	print("SESSION_WORKLOAD ",report);quit(0 if failures.is_empty() else 1)

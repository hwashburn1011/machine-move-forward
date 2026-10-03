class_name MMFRoadsideOutposts
extends Node3D

# Route scenery, not a raid or optional destination. No alert, docking lock,
# navigation actor, shared random draw, or unbounded list of defeated guards.
const PATH="res://art/roadside-outposts.glb"
const DATA="res://art/roadside-outposts.json"
const FIRST=600.0
const SPACING=1250.0
const REVEAL=240.0
const MIN_REVEAL=140.0
const RETIRE=190.0
const ROOTS=["RoadsideRelayWatch","RoadsideTwinWatch"]
static var models={}
static var recipe={}
var game
var tower: Node3D
var guards: Array=[]
var bound_state: Dictionary={}
var spawned=0
var retired=0
var placement_job={}
var preparation_peak_usec=0
var last_reveal_usec=0

func scenery_envelopes(seed_name: String,band: int,chunk: int) -> Array:
	var seeded=seed_name if band==0 else seed_name+":x-band:"+str(band)
	var bounds=[];var layout=MMFDesertLayout.new()
	for p in layout.generate(seeded,chunk):
		if not game.world.prototypes.has(p.kind):continue
		var box=game.world.prototypes[p.kind].get_aabb()
		var scale_value=float(p.width)/maxf(maxf(box.size.x,box.size.z),.01)
		var basis=Basis.from_euler(Vector3(0,p.yaw,p.tilt),EULER_ORDER_XYZ).scaled(Vector3.ONE*scale_value)
		var at=Vector3(p.x,0,p.z)-basis*Vector3(box.get_center().x,box.position.y,box.get_center().z)
		var transformed=Transform3D(basis,at)*box
		bounds.append(Rect2(Vector2(transformed.position.x+band*256,transformed.position.z+chunk*64),Vector2(transformed.size.x,transformed.size.z)))
	# Reproduce exactly the large scatter's seed, density, scale and rotation.
	# Tiny gravel/vegetation can meet buried footings; vehicle/rock masses cannot.
	for spec in MMFSceneryChunk.SCATTER:
		if spec[0] not in ["rocks","slabs","wreck-wreck","wreck-containers","wreck-debris"]:continue
		if not game.world.scatter_prototypes.has(spec[0]):continue
		var count=int(spec[2])
		if spec[0] in ["wreck-wreck","wreck-containers"]:
			var random=MMFRandom.new();random.seed=MMFRandom.hash_seed([seeded,"wasteland-salvage-density",chunk,spec[0]])
			var sparse=MMFDesertLayout.neighborhood(seeded,chunk).name=="open-desert"
			var chance=(.08 if sparse else .25) if spec[0]=="wreck-wreck" else (.12 if sparse else .35)
			if random.randf()>chance:continue
			count=1 if spec[0]=="wreck-wreck" else random.randi_range(1,2)
		var box=game.world.scatter_prototypes[spec[0]].mesh.get_aabb()
		for transform in MMFDesertLayout.scatter(seeded,chunk,band,spec[1],count,spec[3],spec[4],spec[5],spec[6]):
			var transformed=transform*box
			bounds.append(Rect2(Vector2(transformed.position.x+band*256,transformed.position.z+chunk*64),Vector2(transformed.size.x,transformed.size.z)))
	return bounds

func placement_request(spec: Dictionary,predicted: float) -> Dictionary:
	var keys={};var candidates=[];var z=-float(spec.atDistance);var chunk=int(floor(z/64))
	for side in [int(spec.side),-int(spec.side)]:
		for offset in [float(spec.offset),32.0,38.0,42.0]:
			var x=predicted+side*offset;var band=int(round(x/256))
			candidates.append({"worldX":x,"side":side,"footprint":Rect2(Vector2(x-4.2,z-4.2),Vector2(8.4,8.4))})
			for b in range(band-1,band+2):
				for c in range(chunk-2,chunk+3):
					keys[Vector2i(c,b)]=true
	return {"slot":spec.slot,"seed":game.session.seed_name,"keys":keys.keys(),"index":0,"envelopes":[],"candidates":candidates}

func placement_step(job: Dictionary):
	if int(job.index)>=job.keys.size():return
	var key=job.keys[int(job.index)]
	job.envelopes.append_array(scenery_envelopes(job.seed,key.y,key.x));job.index+=1

func placement_result(job: Dictionary) -> Dictionary:
	if int(job.index)<job.keys.size():return {}
	for candidate in job.candidates:
		var clear=true
		for bounds in job.envelopes:
			if candidate.footprint.intersects(bounds.grow(.8)):clear=false;break
		if clear:return {"worldX":candidate.worldX,"side":candidate.side}
	return {}

func clear_placement(spec: Dictionary,predicted: float) -> Dictionary:
	# Offline tests/review use the exact same job synchronously. Production
	# prepares at most one chunk per physics frame before the tower is revealed.
	var job=placement_request(spec,predicted)
	while int(job.index)<job.keys.size():placement_step(job)
	return placement_result(job)

static func defaults() -> Dictionary:return {"nextSlot":0,"active":{}}

static func valid(raw) -> bool:
	if not raw is Dictionary or raw.size()!=2:return false
	if not MMFSaveValidation.number(raw.get("nextSlot"),0,1000000000,true) or not raw.get("active") is Dictionary:return false
	var a=raw.active
	if a.is_empty():return true
	if a.size()!=7 or not MMFSaveValidation.number(a.get("slot"),0,999999999,true) or int(a.slot)+1!=int(raw.nextSlot):return false
	if not MMFSaveValidation.number(a.get("atDistance"),0,1e12) or not MMFSaveValidation.number(a.get("worldX"),-1e12,1e12):return false
	# JSON numbers restore as floats; validate integral numeric values before
	# converting rather than using Array.has's type-sensitive enum membership.
	if not MMFSaveValidation.number(a.get("side"),-1,1,true) or int(a.side)==0:return false
	if not MMFSaveValidation.number(a.get("variant"),0,1,true):return false
	if not a.get("health") is Array or a.health.size()!=int(a.variant)+1:return false
	for health in a.health:
		if not MMFSaveValidation.number(health,0,MMFOutpostGuard.MAX_HEALTH):return false
	if not a.get("shots") is Array or a.shots.size()!=a.health.size():return false
	for shots in a.shots:
		if not MMFSaveValidation.number(shots,0,1000000,true):return false
	return true

static func slot_spec(seed_name: String,index: int) -> Dictionary:
	var rng=MMFEnemyBallistics.rng_for([seed_name,"roadside-slot-v1",index])
	return {"slot":index,"atDistance":FIRST+index*SPACING+rng.randf_range(-80 if index==0 else -180,80 if index==0 else 180),
		"side":-1 if rng.randf()<.5 else 1,"variant":0 if index==0 or rng.randf()<.6 else 1,"offset":rng.randf_range(32,38)}

static func own(node: Node):
	for child in node.get_children():child.owner=node;_own_descendants(child,node)

static func _own_descendants(node: Node,owner_node: Node):
	for child in node.get_children():child.owner=owner_node;_own_descendants(child,owner_node)

static func prepare_models():
	if not models.is_empty():return
	# The stationed Warden's fitted equipment is also needed on first reveal.
	# Its collection is threaded into MMFAssets by title preparation first.
	var attachment=MMFArt100Story.part("WardenRangefinder");attachment.free()
	# StandardMaterial finishes lazily create renderer resources. Prepare the
	# same cached surface overrides here, without adding a live guard actor.
	var finish_preview={"kind":"warden","visual":MMFAssets.scene(MMFEnemyModels.path("warden"))}
	MMFArt100RobotDetails.finish_body(finish_preview)
	for mesh in MMFAssets.of_type(finish_preview.visual,"MeshInstance3D"):
		for surface in mesh.mesh.get_surface_count():
			var material=mesh.get_active_material(surface)
			if material:material.get_rid()
	finish_preview.visual.free()
	recipe=MMFAssets.json(DATA)
	var kit=MMFAssets.scene(PATH);MMFArt100Materials.prepare(kit)
	for id in ROOTS:
		var part=MMFAssets.find_named(kit,id)
		if not part:push_error("Missing roadside tower assembly: "+id);continue
		own(part)
		var packed=PackedScene.new()
		if packed.pack(part)==OK:models[id]=packed
	kit.free()

static func clear_cache():models.clear();recipe.clear()

func setup(owner_game):game=owner_game;name="RoadsideOutposts"

func reset():
	if is_instance_valid(tower):tower.queue_free()
	tower=null;guards.clear();bound_state={};placement_job={}

func protected() -> bool:
	var s=game.session
	return s.story.phase in ["crossfire","braking","docked","ending-journey","arrival","complete","finale-link","finale-docked"] or s.contacts.active.get("state","") in ["committed","docked","visited"] or s.recovery.phase=="service"

func near_destination(at_distance: float) -> bool:
	var s=game.session
	if s.story.phase in ["approach","braking","docked","departing","ending-journey","arrival","finale-link","finale-docked"] and absf(at_distance-float(s.story.arrival))<200:return true
	var contact=s.contacts.active
	return contact.get("state","") in ["committed","docked","visited"] and absf(at_distance-float(contact.get("atDistanceM",-10000)))<200

func may_fire() -> bool:
	return game.started and game.session.opening_done and game.session.health>0 and game.cinematic=="" and not game.menu_open and not get_tree().paused and not protected() and not game.combat.active_threat()

func update(dt: float):
	if not game.started or not game.session.opening_done or game.cinematic!="" or game.menu_open:return
	var state=game.session.roadside
	if is_instance_valid(tower):
		if state.active.is_empty() or not is_same(bound_state,state.active):reset()
	if not state.active.is_empty():
		if game.session.distance-float(state.active.atDistance)>RETIRE or near_destination(float(state.active.atDistance)):
			reset();state.active={};retired+=1
		else:
			if not is_instance_valid(tower):assemble(state.active)
			position_tower()
			for guard in guards:
				if is_instance_valid(guard):guard.update(dt,may_fire())
			return
	# Arithmetic catch-up is bounded even for a very late legacy save or a
	# checkpoint jump. Skipped slots become part of the durable watermark.
	state.nextSlot=maxi(int(state.nextSlot),maxi(0,int(floor((game.session.distance-FIRST-180)/SPACING))))
	for ignored in 3:
		var spec=slot_spec(game.session.seed_name,int(state.nextSlot))
		var ahead=float(spec.atDistance)-game.session.distance
		if ahead>REVEAL+60:return
		if ahead<MIN_REVEAL or near_destination(float(spec.atDistance)) or ahead<=REVEAL and (protected() or game.combat.active_threat() or game.session.health<40):
			state.nextSlot+=1;placement_job={};continue
		var predicted=game.session.lateral+sin(deg_to_rad(game.session.course))*ahead
		if placement_job.is_empty() or placement_job.slot!=spec.slot or placement_job.seed!=game.session.seed_name:placement_job=placement_request(spec,predicted)
		var prepare_started=Time.get_ticks_usec();placement_step(placement_job)
		preparation_peak_usec=maxi(preparation_peak_usec,Time.get_ticks_usec()-prepare_started)
		if ahead>REVEAL or int(placement_job.index)<placement_job.keys.size():return
		# A route can be selected after preparation began. Check its new arrival
		# again at the actual commit, before any tower physics exists.
		if near_destination(float(spec.atDistance)):state.nextSlot+=1;placement_job={};continue
		var placement=placement_result(placement_job);placement_job={}
		if placement.is_empty():state.nextSlot+=1;continue
		state.active={"slot":spec.slot,"atDistance":spec.atDistance,"worldX":placement.worldX,
			"side":placement.side,"variant":spec.variant,"health":[MMFOutpostGuard.MAX_HEALTH],"shots":[0]}
		if spec.variant==1:state.active.health.append(MMFOutpostGuard.MAX_HEALTH);state.active.shots.append(0)
		state.nextSlot+=1
		var reveal_started=Time.get_ticks_usec();assemble(state.active);position_tower()
		last_reveal_usec=Time.get_ticks_usec()-reveal_started;return

func position_tower():
	if is_instance_valid(tower):tower.position=Vector3(float(bound_state.worldX)-game.session.lateral,0,game.session.distance-float(bound_state.atDistance))

func box_collision(body: StaticBody3D,at: Vector3,size: Vector3,rotation: Quaternion=Quaternion.IDENTITY):
	var col=CollisionShape3D.new();var shape=BoxShape3D.new();shape.size=size
	col.shape=shape;col.position=at;col.quaternion=rotation;body.add_child(col)

func assemble(state: Dictionary):
	prepare_models();bound_state=state
	tower=Node3D.new();tower.name="RoadsideWatch%06d"%int(state.slot);add_child(tower)
	position_tower();tower.rotation.y=float(state.side)*PI/2
	var id=ROOTS[int(state.variant)]
	if not models.has(id):return
	var visual=models[id].instantiate();tower.add_child(visual)
	var body=StaticBody3D.new();body.name="TowerStructure";body.collision_layer=1;body.collision_mask=0;tower.add_child(body)
	for item in recipe.models[id].collision:
		if item.has("a"):
			var a=MMFAssets.v(item.a);var b=MMFAssets.v(item.b)
			box_collision(body,(a+b)*.5,Vector3(item.width,a.distance_to(b),item.width),Quaternion(Vector3.UP,(b-a).normalized()))
		else:box_collision(body,MMFAssets.v(item.at),MMFAssets.v(item.size))
	var foot_material=MMFAssets.material(Color("6b675b"));var pile_material=MMFAssets.material(Color("454a49"))
	for foot in recipe.models[id].feet:
		var at=MMFAssets.v(foot)
		var absolute=tower.transform*at;absolute.x+=game.session.lateral;absolute.z-=game.session.distance
		var low=INF;var high=-INF
		for x in [-.52,.52]:
			for z in [-.52,.52]:
				var h=MMFDunes.height_at(absolute.x+x,absolute.z+z);low=minf(low,h);high=maxf(high,h)
		var top=high+.14;var bottom=low-.30
		MMFAssets.box(tower,Vector3(1.05,top-bottom,1.05),Vector3(at.x,(top+bottom)*.5,at.z),foot_material)
		# Actual columns emerge from a seated footing, including negative dunes.
		if top<.35:MMFAssets.box(tower,Vector3(.29,.35-top,.29),Vector3(at.x,(top+.35)*.5,at.z),pile_material)
	for i in state.health.size():
		var guard=MMFOutpostGuard.new();tower.add_child(guard)
		guard.position=Vector3(0 if state.variant==0 else (-.95 if i==0 else .95),18.15,-.68)
		guard.setup(game,self,state,i);guards.append(guard)
	spawned+=1

func _exit_tree():guards.clear();bound_state={}

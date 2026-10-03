class_name MMFSceneryStream
extends RefCounted

const PREPARE_USEC=800
const LATERAL_LEAD=40.0
var world
var ready={}
var pending: MMFSceneryChunk
var wanted={}
var requests: Array=[]
var extra_band=999999
var synchronous_builds=0
var prepared_activations=0
var profile_steps=false
var slow_steps: Array=[]

func setup(owner_world):world=owner_world

func refresh(force: bool=false):
	var state=world.game.session
	var current=int(floor(state.distance/64));var band=int(floor(state.lateral/256))
	var edge=fposmod(state.lateral,256)
	var extra=band-2 if edge<LATERAL_LEAD else band+2 if edge>256-LATERAL_LEAD else 999999
	if not force and world.last_chunk==Vector2i(current,band) and extra_band==extra:return
	if force:
		clear()
		for chunk in world.chunks.values():chunk.queue_free()
		world.chunks.clear()
	world.last_chunk=Vector2i(current,band);extra_band=extra
	wanted.clear()
	for side in range(band-1,band+2):wanted[Vector2i(-current-7,side)]=true
	if extra!=999999:
		for row in range(-current-6,-current+3):wanted[Vector2i(row,extra)]=true
		wanted[Vector2i(-current-7,extra)]=true
	# Keep a just-retired edge if an immediate course reversal can reuse it.
	for key in world.chunks.keys():
		if key.x < -current-6 or key.x > -current+2 or absi(key.y-band)>1:
			var chunk=world.chunks[key];world.chunks.erase(key)
			if wanted.has(key):world.remove_child(chunk);ready[key]=chunk
			else:chunk.queue_free()
	for row in range(-current-6,-current+3):
		for side in range(band-1,band+2):
			var key=Vector2i(row,side)
			if world.chunks.has(key):continue
			var chunk: Node3D
			if ready.has(key):
				chunk=ready[key];ready.erase(key);prepared_activations+=1
			elif pending and pending.key==key:
				chunk=pending.finish();pending=null;synchronous_builds+=1
			else:
				chunk=MMFSceneryChunk.new(world,key).finish();synchronous_builds+=1
			chunk.position=Vector3(side*256-state.lateral,0,state.distance+row*64)
			world.add_child(chunk);chunk.reset_physics_interpolation();world.chunks[key]=chunk
	for key in ready.keys():
		if not wanted.has(key):ready[key].free();ready.erase(key)
	if pending and not wanted.has(pending.key):pending.root.free();pending=null
	requests.clear()
	for key in wanted:
		if not ready.has(key) and (not pending or pending.key!=key):requests.append(key)

func prepare(budget_usec: int=PREPARE_USEC):
	var start=Time.get_ticks_usec()
	while Time.get_ticks_usec()-start<budget_usec:
		var step_start=Time.get_ticks_usec() if profile_steps else 0
		if not pending:
			if requests.is_empty():return
			pending=MMFSceneryChunk.new(world,requests.pop_front())
		var phase=pending.phase
		var completed=pending.step()
		if profile_steps and slow_steps.size()<128 and Time.get_ticks_usec()-step_start>4000:
			var label=pending.placements[phase].kind if phase<pending.placements.size() else "scatter/"+str(phase-pending.placements.size())
			slow_steps.append({"key":str(pending.key),"phase":phase,"part":label,"ms":(Time.get_ticks_usec()-step_start)/1000.0})
		if completed:
			ready[pending.key]=pending.root;pending=null

func clear():
	if pending:pending.root.free();pending=null
	for chunk in ready.values():chunk.free()
	ready.clear();wanted.clear();requests.clear();extra_band=999999

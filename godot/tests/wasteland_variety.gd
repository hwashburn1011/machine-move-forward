extends SceneTree

# Pure deterministic placement checks: no asset import, rendering or gameplay
# scene needed. Old fixture data is tested against the retained legacy method.
var checks=0
var failures=[]
var large_kinds={}

func _initialize():call_deferred("run")

func check(ok: bool,message: String):
	checks+=1
	if not ok:failures.append(message);push_error(message)

func stats() -> Dictionary:
	return {"chunks":0,"pieces":0,"minDensity":99,"maxDensity":0,"sparseChunks":0,"withinChunkDuplicates":0,"adjacentRoadsideRepeats":0,"longestRoadsideRun":1,"adjacentSlotMatches":0,"adjacentSlotComparisons":0,"neighborJaccardSum":0.0,"adjacentSharedKinds":0,"largeRepeatsOneChunk":0,"largeRepeatsTwoChunks":0,"kindCounts":{},"kindChunks":{},"kindAdjacentRepeats":{},"previous":[],"recent":[],"previousRoadside":"","roadsideRun":0}

func measure(data: Dictionary,placements: Array):
	data.chunks+=1;data.pieces+=placements.size()
	data.minDensity=mini(data.minDensity,placements.size());data.maxDensity=maxi(data.maxDensity,placements.size())
	if placements.size()<=4:data.sparseChunks+=1
	var kinds={};var roadside="";var nearest=INF
	for p in placements:
		if kinds.has(p.kind):data.withinChunkDuplicates+=1
		kinds[p.kind]=true;data.kindCounts[p.kind]=int(data.kindCounts.get(p.kind,0))+1
		if float(p.x)<0 and absf(p.x)<nearest:nearest=absf(p.x);roadside=p.kind
	for kind in kinds:data.kindChunks[kind]=int(data.kindChunks.get(kind,0))+1
	for kind in kinds:
		if not large_kinds.has(kind):continue
		if data.recent.size()>=1 and data.recent[-1].has(kind):data.largeRepeatsOneChunk+=1
		if data.recent.size()>=2 and data.recent[-2].has(kind):data.largeRepeatsTwoChunks+=1
	data.recent.append(kinds)
	if data.recent.size()>2:data.recent.pop_front()
	data.roadsideRun=data.roadsideRun+1 if roadside==data.previousRoadside else 1
	data.longestRoadsideRun=maxi(data.longestRoadsideRun,data.roadsideRun)
	if roadside==data.previousRoadside:data.adjacentRoadsideRepeats+=1
	if not data.previous.is_empty():
		var prior={}
		for p in data.previous:prior[p.kind]=true
		var overlap=0
		for kind in kinds:
			if prior.has(kind):
				overlap+=1;data.adjacentSharedKinds+=1
				data.kindAdjacentRepeats[kind]=int(data.kindAdjacentRepeats.get(kind,0))+1
		data.neighborJaccardSum+=float(overlap)/maxi(1,kinds.size()+prior.size()-overlap)
		for i in mini(placements.size(),data.previous.size()):
			data.adjacentSlotComparisons+=1
			if placements[i].kind==data.previous[i].kind:data.adjacentSlotMatches+=1
	data.previous=placements;data.previousRoadside=roadside

func summary(data: Dictionary) -> Dictionary:
	return {"chunks":data.chunks,"pieces":data.pieces,"meanDensity":float(data.pieces)/data.chunks,"minDensity":data.minDensity,"maxDensity":data.maxDensity,"sparseChunks":data.sparseChunks,"uniqueKinds":data.kindCounts.size(),"withinChunkDuplicates":data.withinChunkDuplicates,"adjacentRoadsideRepeats":data.adjacentRoadsideRepeats,"longestRoadsideRun":data.longestRoadsideRun,"sameSlotRepeatRate":float(data.adjacentSlotMatches)/maxi(1,data.adjacentSlotComparisons),"meanNeighborJaccard":data.neighborJaccardSum/maxi(1,data.chunks-1),"adjacentSharedKinds":data.adjacentSharedKinds,"largeRepeatsOneChunk":data.largeRepeatsOneChunk,"largeRepeatsTwoChunks":data.largeRepeatsTwoChunks,"kindChunks":data.kindChunks,"kindAdjacentRepeats":data.kindAdjacentRepeats}

func run():
	var layout=MMFDesertLayout.new();var routes=[];var started=Time.get_ticks_usec();var generation_us=[]
	for spec in MMFDesertLayout.LEGACY_LANDMARKS+MMFDesertLayout.VEHICLES+MMFDesertLayout.UTILITIES+MMFDesertLayout.WASTELAND+MMFDesertLayout.ART100+MMFArt200Scenery.SPECS:
		if float(spec[1])>=10:large_kinds[spec[0]]=true
	var fixtures=JSON.parse_string(FileAccess.get_file_as_string("res://data/desert-fixtures.json"))
	for fixture in fixtures:
		var actual=layout.generate_legacy(fixture.seed,int(fixture.chunk));var matches=actual.size()==fixture.placements.size()
		for i in actual.size():
			for key in actual[i]:
				if key=="kind":matches=matches and actual[i][key]==fixture.placements[i][key]
				else:matches=matches and absf(actual[i][key]-fixture.placements[i][key])<.00001
		check(matches,"Historical fixture remains exact for "+fixture.seed+" / "+str(fixture.chunk))
	for seed_name in ["nomad-wasteland","survivor-road","sand-2718","sideband-tour:x-band:-2"]:
		var old=stats();var fresh=stats();var snapshots={};var dense_ok=true;var clearance_ok=true;var seam_ok=true;var spacing_ok=true;var unique_ok=true;var bounds_ok=true
		var themes={};var lengths={};var last_theme=-1;var last_neighborhood=99999;var changed_theme=true
		for chunk in range(-256,256):
			var legacy=layout.generate_legacy(seed_name,chunk)
			var generation_started=Time.get_ticks_usec()
			var placements=layout.generate(seed_name,chunk)
			generation_us.append(Time.get_ticks_usec()-generation_started)
			measure(old,legacy);measure(fresh,placements)
			snapshots[chunk]=JSON.stringify(placements)
			dense_ok=dense_ok and placements.size()<=11 and placements.size()>=3
			var seen={}
			for i in placements.size():
				var p=placements[i];var radius=float(p.width)*.75
				unique_ok=unique_ok and not seen.has(p.kind);seen[p.kind]=true
				clearance_ok=clearance_ok and absf(p.x)-radius>=(48 if p.x>0 else 14)
				seam_ok=seam_ok and absf(p.x)+radius<=124.001 and absf(p.z)+radius<=30.001
				bounds_ok=bounds_ok and p.width>0 and p.burial>=.012 and p.burial<=.16 and absf(p.tilt)<=.06 and p.tint>=.8 and p.tint<=1 and is_finite(p.yaw)
				for j in range(i):
					var q=placements[j]
					spacing_ok=spacing_ok and Vector2(p.x-q.x,p.z-q.z).length()+.001>=radius+float(q.width)*.75+2
			var neighborhood=MMFDesertLayout.neighborhood(seed_name,chunk)
			themes[neighborhood.theme]=true;lengths[neighborhood.index]=int(lengths.get(neighborhood.index,0))+1
			if neighborhood.index!=last_neighborhood and last_neighborhood!=99999:changed_theme=changed_theme and neighborhood.theme!=last_theme
			last_theme=neighborhood.theme;last_neighborhood=neighborhood.index
		check(dense_ok,seed_name+": all chunks remain within the 3–11 piece streaming cap")
		check(clearance_ok,seed_name+": rotation-safe footprints clear travel and right docking lanes")
		check(seam_ok,seed_name+": footprints leave gaps at longitudinal and lateral chunk seams")
		check(spacing_ok,seed_name+": bounded placement avoids overlapping authored footprints")
		check(unique_ok and fresh.withinChunkDuplicates==0,seed_name+": no repeated model inside a chunk")
		check(bounds_ok,seed_name+": scale, tilt, burial and tint stay controlled")
		check(fresh.adjacentRoadsideRepeats==0,seed_name+": adjacent roadside meshes never repeat, including negative chunks and bag boundaries")
		check(fresh.largeRepeatsOneChunk==0 and fresh.largeRepeatsTwoChunks==0,seed_name+": all large and new silhouettes have two complete neighboring chunks of cooldown, including reserved roadside picks")
		check(themes.size()==8 and changed_theme,seed_name+": every theme occurs without adjacent repeated neighborhoods")
		check(lengths.values().all(func(count):return count>=4 and count<=12) and lengths.values().any(func(count):return count!=8),seed_name+": neighborhood durations vary across the route")
		check(fresh.sparseChunks>40 and fresh.sparseChunks<200,seed_name+": open stretches occur without making the route uniformly empty")
		check(fresh.kindCounts.size()>old.kindCounts.size(),seed_name+": long traversal uses more distinct models")
		for spec in MMFDesertLayout.WASTELAND:check(fresh.kindCounts.get(spec[0],0)>0,seed_name+": new model appears: "+spec[0])
		var a=summary(old);var b=summary(fresh)
		check(b.sameSlotRepeatRate<a.sameSlotRepeatRate*.65,seed_name+": repeated slot silhouettes drop by at least 35 percent")
		check(b.meanNeighborJaccard<a.meanNeighborJaccard,seed_name+": adjacent chunks share fewer model kinds")
		var reversible=true
		# Reverse and shuffled lookups reuse the same generator object after it has
		# visited distant chunks and other seeds, like streaming eviction/reload.
		for chunk in range(255,-257,-1):reversible=reversible and JSON.stringify(layout.generate(seed_name,chunk))==snapshots[chunk]
		var order=MMFDesertLayout.shuffled(seed_name,"test-order",0,range(-256,256))
		for chunk in order:
			layout.generate("unrelated-seed",chunk*7919)
			reversible=reversible and JSON.stringify(layout.generate(seed_name,chunk))==snapshots[chunk]
		check(reversible,seed_name+": reverse travel, interleaving and shuffled reload preserve exact placement")
		routes.append({"seed":seed_name,"chunks":[-256,255],"distanceM":512*64,"legacy":a,"new":b,"newModelCounts":fresh.kindCounts})
	# Budget reductions retain a prefix; oversized requests never inflate density.
	for chunk in [-100001,-42,-1,0,1,42,100001]:
		var full=layout.generate("budget-route",chunk)
		for budget in [-1,0,1,4,11,99]:
			check(layout.generate("budget-route",chunk,budget)==full.slice(0,clampi(budget,0,11)),"Budget prefix is stable at "+str(chunk)+" / "+str(budget))
	var bands={}
	for band in [-3,-1,0,1,3]:
		var seed_name="lateral-route" if band==0 else "lateral-route:x-band:"+str(band)
		var forward=layout.generate(seed_name,-17)
		bands[band]=JSON.stringify(forward)
		check(MMFDesertLayout.new().generate(seed_name,-17)==forward,"Fresh generators reproduce lateral band "+str(band))
	check(bands.values().size()==5 and bands.values().all(func(value):return bands.values().count(value)==1),"Lateral band seeds create distinct stable layouts")
	seed(9173);var first=randi();var second=randi()
	seed(9173);var actual_first=randi();layout.generate("rng-isolation",12345);var actual_second=randi()
	check(first==actual_first and second==actual_second,"Cosmetic generation does not consume the global gameplay random stream")
	generation_us.sort()
	var timing={"samples":generation_us.size(),"medianMs":generation_us[generation_us.size()/2]/1000.0,"p95Ms":generation_us[int(generation_us.size()*.95)]/1000.0,"maxMs":generation_us[-1]/1000.0}
	var report={"checks":checks,"failures":failures,"passed":failures.is_empty(),"routes":routes,"generationCpu":timing,"elapsedMs":(Time.get_ticks_usec()-started)/1000.0,"scope":"Pure seeded-generator statistics and deterministic placement invariants; art footprint and rendered streaming integration verified separately"}
	var destination="res://../test-results/godot-native/wasteland-variety.json"
	var file=FileAccess.open(destination,FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	for route in routes:
		var before=route.legacy.duplicate();var after=route.new.duplicate()
		for key in ["kindChunks","kindAdjacentRepeats"]:before.erase(key);after.erase(key)
		print("WASTELAND_ROUTE ",JSON.stringify({"seed":route.seed,"legacy":before,"new":after}))
	print("WASTELAND_VARIETY ",checks," checks; failures=",failures,"; elapsedMs=",report.elapsedMs)
	quit(0 if failures.is_empty() else 1)

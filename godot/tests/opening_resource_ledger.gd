extends SceneTree

# Synthetic accounting through real resource/crafting authorities. This is not
# an input-driven campaign, a novice timing study, or a claim about all travel.
var data={}
var checks=0
var failures=[]
var rows=[]
var source_hash_start=""

func _initialize():call_deferred("run")

func check(ok: bool,label: String):
	checks+=1
	if not ok:failures.append(label);print("FAIL ",label)

func collect(s,ledger: Dictionary):
	var reward=s.salvage_reward()
	ledger.cargo_collected+=1
	for item in reward:
		var left=s.add_resource(item,int(reward[item]))
		ledger.earned[item]=int(ledger.earned.get(item,0))+int(reward[item])-left
		if left>0:ledger.pending[item]=int(ledger.pending.get(item,0))+left

func pay_piece(s,ledger: Dictionary,id: String,cell: Dictionary) -> Dictionary:
	var p=s.create_piece(id,cell)
	check(not p.is_empty(),ledger.case+": can fund "+id)
	if not p.is_empty():
		for item in data.BUILD_PIECES[id].cost:ledger.spent[item]=int(ledger.spent.get(item,0))+int(data.BUILD_PIECES[id].cost[item])
	s.update_power()
	return p

func craft(s,ledger: Dictionary,id: String,times: int,station_id: String) -> bool:
	var recipe=data.RECIPES.filter(func(r):return r.id==id)[0]
	for i in times:
		var ok=s.craft(id,1,station_id)
		check(ok,ledger.case+": can fund "+id)
		if not ok:return false
		for item in recipe.inputs:ledger.spent[item]=int(ledger.spent.get(item,0))+int(recipe.inputs[item])
		ledger.produced[recipe.output.itemId]=int(ledger.produced.get(recipe.output.itemId,0))+int(recipe.output.count)
	return true

func scenario(seed_index: int,kind: String):
	var s=MMFSession.new(data)
	s.seed_name="opening-ledger-"+str(seed_index);s.rng.seed=MMFRandom.hash_seed([s.seed_name]);s.opening_done=true
	var ledger={"case":kind+"/"+str(seed_index),"scenario":kind,"seed":s.seed_name,"cargo_collected":0,"cargo_missed":2 if kind=="missed-cargo" else 0,"earned":{},"spent":{},"produced":{},"pending":{}}
	if kind=="zero-fuel":s.fuel=0
	collect(s,ledger)
	if kind=="zero-fuel":
		# One starting generator consumes 0.06 fuel per simulated second. Fund
		# the unchanged scan plus a small handoff margin from actual cargo only.
		var needed=int(ceil((MMFSession.SCAN_DURATION_SECONDS+4)*.06))
		while s.inventory.count_item("fuel")<needed and ledger.cargo_collected<20:collect(s,ledger)
		check(s.refuel(),ledger.case+": legitimate cargo fuel restarts generation")
	pay_piece(s,ledger,"floor",{"x":3,"y":0,"z":3})
	var refinery=pay_piece(s,ledger,"refinery",{"x":3,"y":0,"z":3})
	if refinery.is_empty():return
	if kind=="damaged-refinery":
		refinery.health=data.BUILD_PIECES.refinery.maxHealth*.5
		var before=s.count_resource("scrap")
		check(s.repair(refinery.instanceId),ledger.case+": repair half-health refinery")
		ledger.spent.scrap=int(ledger.spent.get("scrap",0))+before-s.count_resource("scrap")
		s.update_power()
	if not craft(s,ledger,"refine-components",6,refinery.instanceId):return
	if kind=="extra-crate":
		pay_piece(s,ledger,"floor",{"x":2,"y":0,"z":3})
		pay_piece(s,ledger,"crate",{"x":2,"y":0,"z":3})
	pay_piece(s,ledger,"floor",{"x":4,"y":0,"z":3})
	var workbench=pay_piece(s,ledger,"workbench",{"x":4,"y":0,"z":3})
	if workbench.is_empty():return
	if not craft(s,ledger,"craft-scanner-replacement-module",1,workbench.instanceId):return
	check(s.install_scanner(),ledger.case+": paid module installs at receiver authority")
	ledger.spent["scanner-replacement-module"]=1
	while s.count_resource("components")<int(data.BUILD_PIECES["turret-manual"].cost.components):
		if not craft(s,ledger,"refine-components",1,refinery.instanceId):return
	pay_piece(s,ledger,"floor",{"x":3,"y":0,"z":4})
	var turret=pay_piece(s,ledger,"turret-manual",{"x":3,"y":0,"z":4})
	check("manual-turret" in s.unlocks and not turret.is_empty(),ledger.case+": first cargo unlock and normal defense cost hold")
	check(s.start_scan(),ledger.case+": funded opening can start its powered scan")
	for i in int(MMFSession.SCAN_DURATION_SECONDS)+4:s.tick(1,true,true)
	check(s.scanner.phase=="consumed",ledger.case+": active eligible scan and handoff complete without free fuel")
	ledger.final={"scrap":s.count_resource("scrap"),"components":s.count_resource("components"),"fuel_items":s.count_resource("fuel"),"generator_fuel":s.fuel,"scanner":s.scanner.phase}
	for item in ["scrap","components"]:
		var start=int(data.STARTING_INVENTORY.get(item,0))
		check(start+int(ledger.earned.get(item,0))+int(ledger.produced.get(item,0))-int(ledger.spent.get(item,0))==s.count_resource(item),ledger.case+": exact "+item+" ledger reconciles")
	rows.append(ledger)

func range_for(values: Array) -> Dictionary:
	values.sort()
	return {"min":values.front(),"median":values[values.size()/2],"max":values.back()}

func run():
	source_hash_start=MMFPlaytestRecorder.source_fingerprint()
	data=MMFAssets.json("res://data/definitions.json")
	var runtime=MMFAssets.json("res://data/runtime-play.json")
	MMFNativeSurvivorData.apply(data,runtime);MMFNativeProgression.apply(data)
	for kind in ["ordinary","extra-crate","missed-cargo","damaged-refinery","zero-fuel"]:
		for seed_index in 100:scenario(seed_index,kind)
	var summaries={}
	for kind in ["ordinary","extra-crate","missed-cargo","damaged-refinery","zero-fuel"]:
		var samples=rows.filter(func(row):return row.scenario==kind)
		if samples.is_empty():continue
		summaries[kind]={"samples":samples.size(),"final_scrap":range_for(samples.map(func(row):return row.final.scrap)),"cargo_collected":range_for(samples.map(func(row):return row.cargo_collected)),"generator_fuel":range_for(samples.map(func(row):return row.final.generator_fuel))}
	var source_hash_end=MMFPlaytestRecorder.source_fingerprint()
	var report={"source_hash":source_hash_start,"source_hash_end":source_hash_end,"source_stable":source_hash_start==source_hash_end,"mode":"synthetic","human_test":false,"checks":checks,"failures":failures,"passed":failures.is_empty(),"samples":rows.size(),"starting_inventory":data.STARTING_INVENTORY,"scan_seconds":MMFSession.SCAN_DURATION_SECONDS,"minimum_opening_bill":{"scrap":228,"components_refined":12,"included":"Three floor plates, refinery, workbench, six refining batches, scanner module, manual deck gun; starting generator/floor already exist."},"assumptions":["Uses ordinary MMFSession costs, actual seeded salvage rewards, real crafting/repair/refuel and one-second simulation ticks.","Cargo is successfully recovered; no geometry, throw skill, collection/travel delay, random combat or extra generator fuel burn is simulated.","The missed-cargo case skips two reward collections only. Spawn and other gameplay also share RNG; this ledger does not model those calls, route delays or fuel costs and does not claim the full world RNG sequence remains unchanged.","Zero fuel is an isolated recovery accounting case, collecting ordinary cargo until it can fund the unchanged scan. It does not prove the collection time or danger is acceptable.","Prepared checkpoint stock is not used. No rewards, currencies, timers or fuel rates are tuned by this analysis.","Later-expedition reward distributions, continuous-campaign pacing and human misunderstanding remain outside this bounded opening ledger."],"summary":summaries,"runs":rows}
	var output="res://../docs/godot-port/results/opening-resource-ledger-2026-09-28.json"
	var file=FileAccess.open(output,FileAccess.WRITE);file.store_string(JSON.stringify(report,"  "));file.close()
	print("OPENING_RESOURCE_LEDGER ",JSON.stringify({"checks":checks,"failures":failures,"samples":rows.size(),"summary":summaries}))
	quit(0 if failures.is_empty() else 1)

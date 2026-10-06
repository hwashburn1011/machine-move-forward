extends SceneTree

# Transaction/economy fixtures, not an earned or human playthrough. The campaign
# actor owns movement, time, hazards and live cargo interception coverage.
var checks=0
var failures=[]
var data: Dictionary

func check(ok: bool,label: String):
	checks+=1
	if not ok:failures.append(label);push_error(label)

func fresh(seed_name: String="first-hour-fixture"):
	var s=MMFSession.new(data.duplicate(true))
	s.rng.seed=MMFRandom.hash_seed([seed_name])
	return s

func set_scrap(s, amount: int):
	for bag in s.containers():bag.remove("scrap",bag.count_item("scrap"))
	s.add_resource("scrap",amount)

func _initialize():
	data=JSON.parse_string(FileAccess.get_file_as_string("res://data/definitions.json"))
	var low={"scrap":999,"components":999,"fuel":999,"leftover":999,"seed":""}
	var no_components=0
	for i in 512:
		var seed_name="first-hour-%d"%i
		var s=fresh(seed_name)
		var cargo=s.salvage_reward()
		for id in cargo:check(s.add_resource(id,cargo[id])==0,"Cargo fits: "+seed_name+" / "+id)
		low.scrap=mini(low.scrap,cargo.scrap)
		low.components=mini(low.components,cargo.get("components",0))
		low.fuel=mini(low.fuel,cargo.fuel)
		if cargo.get("components",0)==0:no_components+=1
		# Conservative purchase budget includes three support floors even though
		# free machine deck space is available. All stations/recipes are paid.
		for x in [3,4,5]:check(not s.create_piece("floor",{"x":x,"y":0,"z":3}).is_empty(),"Paid support: "+seed_name)
		var refinery=s.create_piece("refinery",{"x":3,"y":0,"z":3})
		check(not refinery.is_empty(),"Paid refinery: "+seed_name)
		s.update_power()
		var batches=0
		while s.count_resource("components")<12 and batches<6:
			check(s.craft("refine-components",1,refinery.instanceId),"Paid refinement: "+seed_name)
			batches+=1
		check(not s.create_piece("workbench",{"x":4,"y":0,"z":3}).is_empty(),"Paid bench: "+seed_name)
		s.update_power()
		check(s.craft("craft-scanner-replacement-module"),"Paid module: "+seed_name)
		check(s.install_scanner() and s.start_scan(),"Scanner powered: "+seed_name)
		check(not s.create_piece("turret-manual",{"x":5,"y":0,"z":3}).is_empty(),"Paid gun: "+seed_name)
		s.update_power()
		check(s.station_powered("turret-manual") and s.powered.get("fixed-radio",false),"Gun and scanner powered: "+seed_name)
		if s.count_resource("scrap")<low.leftover:low.leftover=s.count_resource("scrap");low.seed=seed_name
	check(no_components>0 and low.components==0,"Sample includes component-free first cargo")
	check(low.scrap==34 and low.fuel==4,"Sample reaches guaranteed cargo floors")
	check(low.leftover>=66,"Minimum opening purchase reserve survives low rolls")
	# A novice may spend their reserve on optional construction. Guidance must
	# recover immediately and never grant material or advance progression.
	var s=fresh();s.facts.salvage=true;s.scanner.phase="awaiting-module"
	set_scrap(s,79)
	var before=s.native_snapshot()
	var task=MMFObjectiveGuide.describe(s)
	check(task.id=="recover-scrap" and task.action.contains("1 more scrap") and task.pin.id=="refinery","Unaffordable refinery points to salvage with exact shortfall")
	check(s.native_snapshot()==before,"Recovery guidance is read only")
	s.add_resource("scrap",1)
	check(MMFObjectiveGuide.describe(s).id=="build-refinery","Refinery becomes actionable as soon as affordable")
	s.create_piece("refinery",{"x":3,"y":0,"z":3},0,{},true);set_scrap(s,7)
	task=MMFObjectiveGuide.describe(s)
	check(task.id=="recover-scrap" and task.pin.id=="refine-components" and task.action.contains("Recovered components"),"Refining shortage explains both salvage routes")
	s.add_resource("components",4);set_scrap(s,29)
	task=MMFObjectiveGuide.describe(s)
	check(task.id=="recover-scrap" and task.pin.id=="workbench","Owned components do not hide missing bench scrap")
	s.add_resource("scrap",1)
	check(MMFObjectiveGuide.describe(s).id=="build-workbench","Affordable bench bypasses refining")
	s.create_piece("workbench",{"x":4,"y":0,"z":3},0,{},true);set_scrap(s,3)
	task=MMFObjectiveGuide.describe(s)
	check(task.id=="recover-scrap" and task.pin.id=="craft-scanner-replacement-module","Module shortage points to salvage")
	s.add_resource("scrap",1)
	check(MMFObjectiveGuide.describe(s).id=="craft-scanner","Affordable module restores crafting direction")
	s.add_resource("scanner-replacement-module",1);set_scrap(s,0)
	check(MMFObjectiveGuide.describe(s).id=="install-scanner","Already owned module needs no extra spending")
	var output="res://../test-results/v1-onboarding"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output))
	var file=FileAccess.open(output+"/economy.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"checks":checks,"failures":failures,"seeds":512,"minimums":low,"component_free_rolls":no_components,"evidence":"paid transaction fixtures; not movement, elapsed survival or human comprehension","source_hash":MMFPlaytestRecorder.source_fingerprint()},"  "))
	print("FIRST HOUR ECONOMY: ",checks," checks, ",failures.size()," failures; minimums ",low)
	quit(0 if failures.is_empty() else 1)

class_name MMFNativeProgression
extends RefCounted

const RETIRED_ITEMS={"water":"fuel","rations":"scrap","greens":"scrap"}
const RETIRED_PIECES=["condenser","planter","stove"]
# Reloading uses no reserve; retain ammo items in older inventories, but do not
# offer recipes that spend materials without providing a usable benefit.
const RETIRED_RECIPES=["craft-rifle-ammo","craft-shotgun-ammo"]
const MODULES={
	"salvage-crane":{"name":"Salvage crane","site":"Recovery gantry","milestone":"quiet-array","cost":{"scrap":45,"components":5},"draw":4},
	"battery-bank":{"name":"Battery bank","site":"Silent substation","milestone":"glass-orchard","cost":{"scrap":35,"components":6},"draw":0},
	"quiet-drive":{"name":"Quiet-running assembly","site":"Screened relay","milestone":"glass-orchard","cost":{"scrap":40,"components":8},"draw":0}
}

static func supplies(raw: Dictionary) -> Dictionary:
	var converted={}
	for id in raw:
		var target=RETIRED_ITEMS.get(id,id)
		converted[target]=converted.get(target,0)+raw[id]
	return converted

static func apply(data: Dictionary):
	MMFSalvageAutomation.apply_data(data)
	MMFArt100Decor.apply(data)
	MMFArt200Decor.apply(data)
	MMFNomadPersonalization.apply_data(data)
	data.STARTING_INVENTORY=supplies(data.STARTING_INVENTORY)
	data.RECIPES=data.RECIPES.filter(func(recipe):
		return recipe.id not in RETIRED_RECIPES and recipe.output.itemId not in RETIRED_ITEMS and not recipe.inputs.keys().any(func(id):return id in RETIRED_ITEMS))
	data.BUILD_PIECE_ORDER=data.BUILD_PIECE_ORDER.filter(func(id):return id not in RETIRED_PIECES)
	for id in RETIRED_PIECES:
		data.BUILD_PIECES[id].name="Retired "+id.capitalize()
		data.BUILD_PIECES[id].description="Old equipment. Recover any stored materials, then dismantle with the cutter."
	data.BUILD_PIECES["seed-garden"].name="Seed preservation display"
	data.BUILD_PIECES["seed-garden"].description="Preserves the Orchard's human seed archive. Decorative; requires no supplies."
	data.KEEPSAKE_DETAILS["human-seed-bank"].text="Recovered at Glass Orchard. These sealed samples preserve the viable seeds entrusted to S-07. The bank unlocks a decorative seed preservation display aboard the Nomad."
	data.OPPORTUNITIES["fuel-cache"]={"title":"Fuel reserve"}
	# Preserve the old mesh ID, but replace its gameplay identity and rewards.
	for value in data.DESERT_OPPORTUNITIES.values():
		if value.contactKind=="water-cache":value.contactKind="fuel-cache"
	for id in MODULES:
		var spec=MODULES[id]
		data.OPPORTUNITIES["gear-"+id]={"title":spec.site}
		var piece=data.BUILD_PIECES.generator.duplicate(true)
		piece.merge({"id":id,"name":spec.name,"cost":spec.cost.duplicate(),"weight":210,"maxHealth":150,"rotatable":true},true)
		piece.description={"salvage-crane":"Use at the crane to hoist heavy cargo. Requires 4 power and a clear cable path.","battery-bank":"Charges from spare generation. Stores 120 units; supplies up to 4 power to receiver, helm and fieldwork tools.","quiet-drive":"Toggle at the assembly. Quieter travel halves scout detection buildup, with 35% less speed and 4 less generator output."}[id]
		data.BUILD_PIECES[id]=piece
		if id not in data.BUILD_PIECE_ORDER:data.BUILD_PIECE_ORDER.append(id)

static func retired_recipe_pin(value) -> bool:
	return value is Dictionary and value.size()==2 and value.get("kind")=="recipe" and value.get("id") is String and value.id in RETIRED_RECIPES

static func runtime_contract(runtime: Dictionary):
	MMFArt100Decor.runtime_contract(runtime)
	MMFArt200Decor.runtime_contract(runtime)
	runtime.pieceColliders["collector-auto"]=[
		{"offset":{"x":0,"y":.115,"z":0},"half":{"x":.76,"y":.115,"z":.76}},
		{"offset":{"x":0,"y":.52,"z":-.65},"half":{"x":.5,"y":.29,"z":.14}},
		{"offset":{"x":-.5,"y":.27,"z":0},"half":{"x":.12,"y":.05,"z":.5}},
		{"offset":{"x":.5,"y":.27,"z":0},"half":{"x":.12,"y":.05,"z":.5}}]
	for id in MODULES:
		runtime.pieceColliders[id]=[{"offset":{"x":0,"y":.65,"z":0},"half":{"x":.68,"y":.65,"z":.65}}]
	# The compact crane folds over its own service footprint.
	runtime.pieceColliders["salvage-crane"].append({"offset":{"x":0,"y":1.65,"z":0},"half":{"x":.2,"y":.35,"z":.55}})

static func gear_defaults() -> Dictionary:
	return {"recovered":[],"sites":{},"quiet":false,"lastRecoveryDistance":-1.0}

static func radar_ready(s) -> bool:
	return "quiet-array" in s.story.completed and "course-actuator" in s.story.uniques

static func eligible(s,id: String) -> bool:
	if not MODULES.has(id) or MODULES[id].milestone not in s.story.completed:return false
	if id=="salvage-crane":return s.survivor_content.workshop.powered
	if id=="quiet-drive":return not s.expedition_gear.recovered.is_empty() and s.distance-s.expedition_gear.lastRecoveryDistance>=600
	return true

static func next_discovery(s) -> String:
	for id in MODULES:
		if id not in s.expedition_gear.recovered and eligible(s,id):return id
	return ""

static func available(s,id: String) -> bool:
	if id not in s.expedition_gear.recovered:return false
	return s.structures.any(func(p):return p.definitionId==id and p.health>0)

static func quiet_running(s) -> bool:
	return s.expedition_gear.quiet and s.fuel>0 and available(s,"quiet-drive")

static func battery_preview(s) -> Dictionary:
	# Removing generation from a projected list exercises real shedding/backup
	# rules without disconnecting live equipment or draining the player's charge.
	var projected=s.structures.filter(func(p):return p.definitionId!="generator")
	var config=s.operations.duplicate(true);config.sources["loan-generator"]=false
	var budget=MMFPowerBudget.calculate(s,projected,1.0,config)
	var charge=0.0
	for p in projected:
		if p.definitionId=="battery-bank" and p.health>0:charge+=float(p.state.get("charge",0))
	var supplied=[]
	for pair in [["fixed-radio","receiver"],["fixed-helm","helm"],["fixed-fieldwork","fieldwork tools"]]:
		if budget.powered.get(pair[0],false):supplied.append(pair[1])
	return {"charge":charge,"draw":budget.battery_draw,"seconds":charge/budget.battery_draw if budget.battery_draw>0 else 0.0,"supplied":supplied}

static func drive_preview(s) -> Dictionary:
	var bonus=float(s.modifiers().generationBonus)+(4.0 if quiet_running(s) else 0.0)
	var normal=0.0;var quiet=0.0
	for p in s.structures:
		if p.definitionId!="generator" or p.health<=0 or s.fuel<=0 or not MMFMachineOperations.source_enabled(s.operations,p.instanceId):continue
		var condition=float(p.health)/s.data.BUILD_PIECES.generator.maxHealth
		normal+=maxf(0,16+bonus)*condition;quiet+=maxf(0,12+bonus)*condition
	if s.recovery.loan and not s.has_station("generator") and s.fuel>0 and MMFMachineOperations.source_enabled(s.operations,"loan-generator"):
		normal=maxf(0,16+bonus);quiet=maxf(0,12+bonus)
	return {"normal_generation":normal,"quiet_generation":quiet,"demand":s.demand,"quiet_speed_ratio":.65,"quiet_detection_ratio":.5}

static func model(id: String) -> Node3D:
	var path="res://art/nomad-recovered-modules.glb" if id in MODULES else "res://art/expedition-equipment.glb"
	var kit=MMFAssets.scene(path)
	MMFArt100Materials.prepare(kit)
	var part=MMFAssets.find_named(kit,id)
	var result=part.duplicate() if part else Node3D.new()
	kit.free()
	if id=="salvage-crane":configure_model(result,MMFMachineSpaces.bay_candidate(id))
	return result

static func configure_model(root: Node3D,piece: Dictionary):
	if piece.get("definitionId","")!="salvage-crane":return
	var folded=MMFAssets.find_named(root,"FoldedGuide")
	var extended=MMFAssets.find_named(root,"ExtendedJib")
	var deployed=MMFMachineSpaces.deployed_crane(piece)
	if folded:folded.visible=not deployed
	if extended:extended.visible=deployed

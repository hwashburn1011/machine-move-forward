class_name MMFDesertLayout
extends RefCounted

# Native cosmetic layouts use their own random streams. The original browser
# layout remains available below for historical fixture/reference comparisons.
const VEHICLES=[["wreck-pickup",5.6],["wreck-ambulance",6.2],["wreck-forklift",4.2],["survey-rover",4.2],["rail-bogie",3],["container-wagon",9.4],["fuel-trailer",4.5],["wreck-motorcycle",2.7]]
const UTILITIES=[["culvert",6],["transformer",3.1],["fuel-pump",1.8],["utility-cabinet",1.8],["telecom-cabinet",1.8],["condenser",3.2],["satellite-dish",3.2],["light-tower",3.1],["diesel-generator",3.3],["air-compressor",3.1],["fire-hydrant",1.1],["bulk-fuel-tank",7],["cargo-pallet",1.9],["cable-spool",2.9],["road-barrier",3.3],["signal-gantry",9.3],["bus-shelter",5],["crane-pedestal",6.1],["ventilation-turbine",1.7],["pump-skid",3.2],["scrapyard-magnet",2.9],["radar-tower",4],["fallen-antenna",7],["bunker-entrance",4.6],["grain-silo",6],["storm-drain",3],["street-lamp",2.2],["rail-crossing",3.8]]
const WASTELAND=[["wasteland-diner",13],["wasteland-greenhouse",15],["wasteland-service-station",14],["wasteland-observatory",17],["wasteland-passenger-coach",13],["wasteland-excavator",11],["wasteland-wind-turbine",18],["wasteland-cooling-tower",20],["wasteland-tunnel",15],["wasteland-solar-farm",16]]
# Nominal widths match the authored metre dimensions (before modest wear/burial).
const ART100=[["wasteland-cistern",4.6],["wasteland-rail-switch",7.2],["wasteland-container-shelter",6.3],["wasteland-survey-rover",3.9],["wasteland-signal-gantry",9.1],["wasteland-buried-transformer",4],["wasteland-pipeline-valve",4.7],["wasteland-scrap-press",4.3],["wasteland-sensor-mast",3.8],["wasteland-cable-drum",4.2],["wasteland-crawler-wreck",5],["wasteland-water-condenser",3.7],["wasteland-freight-bogie",4.7],["wasteland-checkpoint-gate",7.5],["wasteland-relay-vault",5.4]]
const LEGACY_LANDMARKS=[["ruin-tower",30],["ruin-factory",25],["overpass",30],["ruin-house",12],["ruin-apartment",20],["ruin-shop",12],["water-tower",10],["pylon",8],["billboard",8],["wreck-bus",11],["wreck-tanker",11],["wreck-car",6],["road-sign",6],["water-sign",6]]
const THEMES=["residential","roadside-services","industry","growing-belt","transport","survey","scrapyard","open-desert"]
const THEME_KINDS=[
	["ruin-house","ruin-apartment","ruin-shop","wasteland-diner","bus-shelter","street-lamp","wasteland-container-shelter","wasteland-cistern"],
	["wasteland-service-station","wasteland-diner","wasteland-passenger-coach","wreck-ambulance","fuel-pump","water-tower","wasteland-checkpoint-gate"],
	["wasteland-cooling-tower","ruin-factory","wasteland-excavator","transformer","bulk-fuel-tank","crane-pedestal","wasteland-buried-transformer","wasteland-pipeline-valve"],
	["wasteland-greenhouse","wasteland-solar-farm","grain-silo","condenser","pump-skid","water-tower","wasteland-water-condenser","wasteland-cistern"],
	["wasteland-tunnel","wasteland-passenger-coach","overpass","container-wagon","rail-bogie","rail-crossing","wasteland-rail-switch","wasteland-freight-bogie","wasteland-signal-gantry"],
	["wasteland-observatory","wasteland-wind-turbine","radar-tower","survey-rover","satellite-dish","fallen-antenna","wasteland-survey-rover","wasteland-sensor-mast"],
	["wasteland-excavator","wreck-bus","wreck-tanker","wreck-pickup","scrapyard-magnet","cable-spool","wasteland-scrap-press","wasteland-cable-drum","wasteland-crawler-wreck"],
	["wasteland-wind-turbine","wasteland-solar-farm","pylon","road-sign","water-sign","bunker-entrance","wasteland-relay-vault"]
]
const MAX_LANDMARKS=11
var rng=MMFRandom.new()
var result=[]

func pick(options: Array): return options[rng.randi_range(0,options.size()-1)]
func r(a: float,b: float) -> float: return rng.randf_range(a,b)
func signed(magnitude: float) -> float: return r(-magnitude,magnitude)
func add(kind: String,x: float,z: float,width: float,yaw: float,burial: float=0.045):
	x=signf(x)*maxf(absf(x),(48 if x>0 else 14)+width*0.75)
	result.append({"kind":kind,"x":x,"z":z,"width":width,"yaw":yaw,"burial":burial,"tilt":signed(0.12 if kind.begins_with("wreck") else 0.025),"tint":r(0.78,1)})

static func shuffled(seed_name: String,aspect: String,cycle: int,options: Array) -> Array:
	var random=MMFRandom.new();random.seed=MMFRandom.hash_seed([seed_name,"native-wasteland-v3",aspect,cycle])
	var choices=options.duplicate()
	for i in range(choices.size()-1,0,-1):
		var j=random.randi_range(0,i);var held=choices[i];choices[i]=choices[j];choices[j]=held
	return choices

static func bag_choice(seed_name: String,aspect: String,index: int,options: Array):
	# Each bag is unique. Compare raw neighboring bags without generating history.
	# Keeping their final two entries intact lets the next bag avoid both of them.
	var cycle=int(floor(float(index)/options.size()));var offset=posmod(index,options.size())
	var choices=shuffled(seed_name,aspect,cycle,options)
	if choices.size()>4:
		var previous=shuffled(seed_name,aspect,cycle-1,options)
		for i in 2:
			var blocked=previous.slice(previous.size()-2+i)
			if choices[i] not in blocked:continue
			for j in range(2,choices.size()-2):
				if choices[j] in blocked:continue
				var held=choices[i];choices[i]=choices[j];choices[j]=held;break
	elif choices.size()>2:
		var previous=shuffled(seed_name,aspect,cycle-1,options)
		if choices[0]==previous[-1]:
			var held=choices[0];choices[0]=choices[1];choices[1]=held
	return choices[offset]

static func silhouette_allowed(seed_name: String,chunk: int,kind: String,roadside: Dictionary) -> bool:
	# Foreground picks reserve their silhouette across both neighboring chunks.
	# Other large props win a local priority contest, so two occurrences of the
	# same model cannot coexist within two chunks in either traversal direction.
	if roadside[chunk]==kind:return true
	if kind in roadside.values():return false
	var random=MMFRandom.new();random.seed=MMFRandom.hash_seed([seed_name,"native-wasteland-v3","silhouette",kind,chunk])
	var priority=random.randf()
	for offset in [-2,-1,1,2]:
		random.seed=MMFRandom.hash_seed([seed_name,"native-wasteland-v3","silhouette",kind,chunk+offset])
		if random.randf()>=priority:return false
	return true

static func neighborhood(seed_name: String,chunk: int) -> Dictionary:
	# Unequal 4–12 chunk neighborhoods replace the visible three-chunk cadence.
	var block=int(floor(chunk/32.0));var local=posmod(chunk,32)
	var random=MMFRandom.new();random.seed=MMFRandom.hash_seed([seed_name,"native-wasteland-v3","neighborhood-lengths",block])
	var cuts=[8+random.randi_range(-2,2),16+random.randi_range(-2,2),24+random.randi_range(-2,2)]
	var zone=0
	for cut in cuts:
		if local>=cut:zone+=1
	var index=block*4+zone
	var theme=int(bag_choice(seed_name,"themes",index,range(THEMES.size())))
	return {"index":index,"theme":theme,"name":THEMES[theme]}

func place_varied(spec: Array,near: bool,preferred_side: int,used: Dictionary) -> bool:
	var kind=String(spec[0]);var width=float(spec[1])*r(.92,1.07)
	# Advertising is an occasional landmark, with at most one complete sign
	# assembly in a chunk, including the guaranteed foreground selection.
	var billboard=MMFArt200Scenery.is_billboard(kind)
	if billboard and used.keys().any(func(id):return MMFArt200Scenery.is_billboard(id)):return false
	# Half-diagonal bounds protect the central travel lane and wider right-hand
	# docking lane for any yaw; the band edges also retain a small seam gap.
	var radius=width*.75
	for attempt in 12:
		var side=preferred_side if attempt<6 else (-1 if rng.randf()<.5 else 1)
		# Reserve the close left verge for the single boundary-safe roadside bag.
		# Supporting props must not reintroduce a same-kind run in that foreground.
		var inner=(48 if side>0 else 50)+radius+2
		var outer=124-radius
		if near:side=-1;inner=14+radius+2;outer=minf(47,124-radius)
		var x=side*r(inner,outer);var z=r(-30+radius,30-radius)
		var clear=true
		for other in result:
			if Vector2(x-other.x,z-other.z).length()<radius+float(other.width)*.75+2:clear=false;break
		if not clear:continue
		var wreck=kind.begins_with("wreck") or kind in ["wasteland-passenger-coach","wasteland-excavator"]
		var yaw=(r(-PI,PI) if wreck else rng.randi_range(0,3)*PI/2+signed(.22))
		if billboard:yaw=(PI/2 if side<0 else -PI/2)+signed(.30)
		result.append({"kind":kind,"x":x,"z":z,"width":width,"yaw":yaw,"burial":r(.045,.16) if wreck else r(.012,.07),"tilt":signed(.06 if wreck else .015),"tint":r(.8,1)})
		used[kind]=true
		return true
	return false

func generate(seed_name: String,chunk: int,budget: int=11) -> Array:
	result=[];rng.seed=MMFRandom.hash_seed([seed_name,"native-wasteland-v3","placement",chunk])
	var district=neighborhood(seed_name,chunk)
	var catalog=LEGACY_LANDMARKS+VEHICLES+UTILITIES+WASTELAND+ART100+MMFArt200Scenery.SPECS
	var specs={}
	for spec in catalog:specs[spec[0]]=spec
	# Every authored wasteland assembly gets a foreground turn in the shuffled
	# bag. Large sites otherwise could miss many kilometres of a seeded route.
	var near_choices=VEHICLES+UTILITIES+ART100+WASTELAND+MMFArt200Scenery.SPECS+[["wreck-car",6],["wreck-bus",11],["wreck-tanker",11]]
	var near_spec=bag_choice(seed_name,"roadside",chunk,near_choices)
	var roadside={}
	for offset in range(-2,3):roadside[chunk+offset]=bag_choice(seed_name,"roadside",chunk+offset,near_choices)[0]
	var allowed={}
	for spec in catalog:
		if float(spec[1])>=10:allowed[spec[0]]=silhouette_allowed(seed_name,chunk,spec[0],roadside)
	var used={}
	place_varied(near_spec,true,-1,used)
	# Leave a legible lone silhouette across quiet stretches. On the remaining
	# route, replace unrelated support with a small site organized around its use.
	# The foreground bag still gives every authored model its turn.
	if MMFRoadsideComposition.quiet(seed_name,chunk):
		return result.slice(0,clampi(budget,0,MAX_LANDMARKS))
	if not result.is_empty() and MMFRoadsideComposition.compose(self,result[0],specs,used,allowed):
		return result.slice(0,clampi(budget,0,MAX_LANDMARKS))
	var sparse=int(district.theme)==7 or rng.randf()<.16
	var target_count=rng.randi_range(3,4) if sparse else rng.randi_range(8,MAX_LANDMARKS)
	var theme_pool=THEME_KINDS[int(district.theme)]+MMFArt200Scenery.THEMES[district.name]
	var themed=shuffled(seed_name,"theme-pieces",chunk,theme_pool)
	var others=shuffled(seed_name,"supporting-pieces",chunk,catalog)
	var side=-1 if rng.randf()<.5 else 1
	# Prefer a few recognizable related pieces, then mixed support, without
	# repeating any mesh inside the chunk or growing the old eleven-piece cap.
	for i in (2 if sparse else 4):
		var spec=specs[themed[i]]
		if not used.has(spec[0]) and allowed.get(spec[0],true):place_varied(spec,false,side,used)
		side=-side
	for spec in others:
		if result.size()>=target_count:break
		if not used.has(spec[0]) and allowed.get(spec[0],true):place_varied(spec,false,side,used)
		side=-side
	return result.slice(0,clampi(budget,0,MAX_LANDMARKS))

func generate_legacy(seed_name: String,chunk: int,budget: int=11) -> Array:
	result=[];rng.seed=MMFRandom.hash_seed([seed_name,"chunk",chunk,"desert-district"])
	var district_rng=MMFRandom.new();district_rng.seed=MMFRandom.hash_seed([seed_name,"chunk",int(floor(chunk/3.0)),"desert-neighborhood"])
	var district=district_rng.randi_range(0,3)
	var landmark_block=posmod(chunk,3)==1
	var side=-1 if district_rng.randf()<0.5 else 1
	var landmark
	match district:
		0: landmark="ruin-tower" if landmark_block else pick(["ruin-house","ruin-apartment"])
		1: landmark="ruin-factory" if landmark_block else pick(["water-tower","ruin-shop"])
		2: landmark="overpass" if landmark_block else pick(["pylon","billboard"])
		_: landmark=pick(["wreck-bus","wreck-tanker","road-sign"])
	# Evaluate arguments left to right to preserve the original RNG stream.
	var x=side*r(95,115);var z=r(-12,12)
	var width=r(28,36) if landmark=="ruin-tower" else 30.0 if landmark=="overpass" else 25.0 if landmark=="ruin-factory" else r(17,22) if landmark=="ruin-apartment" else 10.0
	add(landmark,x,z,width,signed(0.3))
	add("ruin-apartment" if district==0 else "wreck-tanker" if district==3 else pick(["ruin-house","ruin-shop"]),side*r(57,75),-20,r(17,22) if district==0 else r(10,14),signed(0.15),r(0.035,0.14))
	add(pick(["wreck-car","wreck-bus","wreck-tanker"]),-r(23,32),r(-20,18),r(6,9),signed(0.5),0.09)
	add(pick(["billboard","water-sign","road-sign"]),-40 if rng.randf()<0.5 else 65,19,r(5,9),signed(0.3),0.02)
	add(pick(["wreck-bus","billboard"]) if district==3 else pick(["ruin-house","ruin-apartment"]),-side*r(83,105),-17,r(5,10) if district==3 else r(12,18),signed(0.2),0.1)
	add("wreck-car",side*58,18,r(5,6.5),signed(1),0.14)
	add("ruin-apartment" if district==0 else "pylon" if district==1 else "wreck-car" if district==3 else "water-tower",side*142,22,r(18,23) if district==0 else r(6,9),signed(0.15))
	add("ruin-house",side*77,25,r(8,11),PI/2+signed(0.1),0.2)
	add(pick(["wreck-bus","wreck-tanker"]),-side*74,14,r(10,12),PI/2+signed(0.2),0.13)
	add("wreck-car",-20,27,5.2,signed(1.3),0.16)
	add("ruin-shop",-side*113,-22,r(9,12),signed(0.4),0.15)
	add("wreck-car",-side*93,29,5.5,signed(2),0.18)
	add("ruin-shop",-side*146,-27,10,signed(0.2),0.15)
	add("ruin-house",side*150,-24,10,signed(0.2),0.22)
	rng.seed=MMFRandom.hash_seed([seed_name,"chunk",chunk,"desert-artifacts-v2"])
	for i in [2,3,5,8,9,10,11,12,13]:
		if rng.randf()<0.3: continue
		var spec=pick(VEHICLES if i in [2,5,8,11] else UTILITIES)
		var p=result[i];p.kind=spec[0];p.width=spec[1]*r(0.96,1.04);p.burial=0.012
		p.tilt=signed(0.045 if p.kind.begins_with("wreck") else 0.012)
		p.x=signf(p.x)*maxf(absf(p.x),(48 if p.x>0 else 14)+p.width*0.75)
	return result.slice(0,budget)

static func scatter(seed_name: String,chunk: int,band: int,aspect: String,count: int,low: float,high: float,sink: float=-1,tilt: float=0.25) -> Array:
	var random=MMFRandom.new();random.seed=MMFRandom.hash_seed([seed_name,"chunk",chunk,aspect])
	var near_band=aspect=="near"
	var clusters=[];var transforms=[]
	for i in clampi(int(ceil(count/3.0)),2,7):
		var side=-1 if random.randf()<0.5 else 1
		clusters.append({"x":side*random.randf_range(8 if near_band else 11,26 if near_band else 175),"z":random.randf_range(-32,32),"type":random.randi_range(0,2)})
	for i in count:
		var c=clusters[i%clusters.size()]
		var spread=3.5 if near_band else 5.5 if c.type==0 else 9.0 if c.type==1 else 3.0
		var angle=random.randf_range(0,TAU);var radius=sqrt(random.randf())*spread
		var x=signf(c.x)*maxf(8 if near_band else 9.5,absf(c.x+cos(angle)*radius))
		var z=c.z+sin(angle)*radius;var scale_value=random.randf_range(low,high)
		var burial=scale_value*sink*random.randf_range(0.55,1.45) if sink>=0 else 0.35*scale_value
		var y=MMFDunes.height_at(x+band*256,z+chunk*64)-burial
		var rotation=Vector3(random.randf_range(-tilt,tilt),random.randf_range(0,TAU),random.randf_range(-tilt,tilt))
		var scale_vector=Vector3(scale_value,scale_value*random.randf_range(0.85 if sink>=0 else 0.6,1.15 if sink>=0 else 1.05),scale_value*random.randf_range(0.8,1.2))
		transforms.append(Transform3D(Basis.from_euler(rotation,EULER_ORDER_XYZ).scaled_local(scale_vector),Vector3(x,y,z)))
	return transforms

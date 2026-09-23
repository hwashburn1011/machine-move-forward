class_name MMFDesertLayout
extends RefCounted

# Seeded placement contract shared with src/world/DesertScenery.ts.
const VEHICLES=[["wreck-pickup",5.6],["wreck-ambulance",6.2],["wreck-forklift",4.2],["survey-rover",4.2],["rail-bogie",3],["container-wagon",9.4],["fuel-trailer",4.5],["wreck-motorcycle",2.7]]
const UTILITIES=[["culvert",6],["transformer",3.1],["fuel-pump",1.8],["utility-cabinet",1.8],["telecom-cabinet",1.8],["condenser",3.2],["satellite-dish",3.2],["light-tower",3.1],["diesel-generator",3.3],["air-compressor",3.1],["fire-hydrant",1.1],["bulk-fuel-tank",7],["cargo-pallet",1.9],["cable-spool",2.9],["road-barrier",3.3],["signal-gantry",9.3],["bus-shelter",5],["crane-pedestal",6.1],["ventilation-turbine",1.7],["pump-skid",3.2],["scrapyard-magnet",2.9],["radar-tower",4],["fallen-antenna",7],["bunker-entrance",4.6],["grain-silo",6],["storm-drain",3],["street-lamp",2.2],["rail-crossing",3.8]]
var rng=MMFRandom.new()
var result=[]

func pick(options: Array): return options[rng.randi_range(0,options.size()-1)]
func r(a: float,b: float) -> float: return rng.randf_range(a,b)
func signed(magnitude: float) -> float: return r(-magnitude,magnitude)
func add(kind: String,x: float,z: float,width: float,yaw: float,burial: float=0.045):
	x=signf(x)*maxf(absf(x),(48 if x>0 else 14)+width*0.75)
	result.append({"kind":kind,"x":x,"z":z,"width":width,"yaw":yaw,"burial":burial,"tilt":signed(0.12 if kind.begins_with("wreck") else 0.025),"tint":r(0.78,1)})

func generate(seed_name: String,chunk: int,budget: int=11) -> Array:
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

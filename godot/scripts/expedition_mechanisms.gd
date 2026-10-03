class_name MMFExpeditionMechanisms
extends RefCounted

# Stable semantic IDs are saved; positions and animation time are not.
const SITES={"wreck-one":["gyro"],"relay-foundry":["power"],"quiet-array":["array"],"glass-orchard":["port","starboard"],"last-garden-meridian":["archive","transmitter"]}
const PROOFS={"gyro":["course-gyro"],"power":["salvage-controller","tracking-servo"],"array":["course-actuator","annika-archive-shard"],"port":["orchard-port-isolator"],"starboard":["orchard-starboard-isolator"],"archive":["meridian-archive-installed"],"transmitter":["meridian-transmitter-online"]}
const STEPS={"gyro":["isolate","brake","release"],"power":["bus","unlock","move","latch"],"array":["port","central","starboard","lock"],"port":["ground","bypass","energize"],"starboard":["ground","bypass","energize"],"archive":["verify","seat","readback"],"transmitter":["link","synchronize","bearing"]}
const CONTROLS={
	"gyro":[
		{"id":"isolate","label":"GYRO / Isolate feed","at":Vector3(-3,1.15,-1.4)},
		{"id":"brake","label":"GYRO / Arrest rotor","at":Vector3(3,1.15,.8)},
		{"id":"release","label":"GYRO / Release cradle","at":Vector3(4.5,1.15,1.8)}],
	"power":[
		{"id":"bus","label":"FOUNDRY / Route recovery power","at":Vector3(-4,1.15,-1.5)},
		{"id":"unlock","label":"GANTRY / Release travel lock","at":Vector3(-3,1.15,2.3)},
		{"id":"move","label":"GANTRY / Move service carriage","at":Vector3(-3,1.15,2.3)},
		{"id":"latch","label":"GANTRY / Latch recovery bay","at":Vector3(5.7,1.15,.6)}],
	"array":[
		{"id":"port","label":"ARRAY / Port service wheel","at":Vector3(-6.3,1.15,-1.8)},
		{"id":"central","label":"ARRAY / Central service wheel","at":Vector3(-.8,1.15,-1.8)},
		{"id":"starboard","label":"ARRAY / Starboard service wheel","at":Vector3(6.3,1.15,-1.8)},
		{"id":"lock","label":"ARRAY / Lock calibrated phase","at":Vector3(-.8,1.15,1.4)}],
	"port":[
		{"id":"ground","label":"PORT / Connect captive ground","at":Vector3(-6.5,1.15,.7)},
		{"id":"bypass","label":"PORT / Close preservation bypass","at":Vector3(-4.8,1.15,-1.0)},
		{"id":"energize","label":"PORT / Energize archive isolator","at":Vector3(-7.1,1.15,-.7)}],
	"starboard":[
		{"id":"ground","label":"STARBOARD / Connect captive ground","at":Vector3(3.3,1.15,.7)},
		{"id":"bypass","label":"STARBOARD / Close preservation bypass","at":Vector3(6.5,1.15,-1.0)},
		{"id":"energize","label":"STARBOARD / Energize archive isolator","at":Vector3(5,1.15,-.7)}],
	"archive":[
		{"id":"verify","label":"ARCHIVE / Verify preserved memory","at":Vector3(-5.7,1.15,3.5)},
		{"id":"seat","label":"ARCHIVE / Seat captive carrier","at":Vector3(-2.4,1.15,3.5)},
		{"id":"readback","label":"ARCHIVE / Verify readback","at":Vector3(-4,1.15,3.5)}],
	"transmitter":[
		{"id":"link","label":"TRANSMITTER / Check archive link","at":Vector3(1.1,1.15,-2.8)},
		{"id":"synchronize","label":"TRANSMITTER / Synchronize feed","at":Vector3(6.8,1.15,-2.5)},
		{"id":"bearing","label":"TRANSMITTER / Confirm bearing","at":Vector3(3.4,1.15,-2.5)}]
}

static func fresh() -> Dictionary:
	return {"step":0,"values":[0,0,0],"done":false,"mechanism":{"format":1,"milestones":[]}}

static func complete_state(id: String,st: Dictionary):
	st.done=true
	st.step=0 if id in ["power","array"] else 3
	if id=="power":st.values=[2,1,0]
	if id=="array":st.values=[25,60,85]
	st.mechanism={"format":1,"milestones":STEPS[id].duplicate()}

static func normalize(id: String,raw: Dictionary,story: Dictionary) -> Dictionary:
	var st=raw.duplicate(true) if not raw.is_empty() else fresh()
	for i in st.values.size():st.values[i]=int(st.values[i])
	var proved=false
	for proof in PROOFS.get(id,[]):
		if proof in story.get("uniques",[]) or proof in story.get("objectives",[]):proved=true
	if proved or st.get("done",false):
		complete_state(id,st)
	elif not st.has("mechanism"):
		var count=0 if id in ["power","array"] else clampi(int(st.get("step",0)),0,3)
		st.mechanism={"format":1,"milestones":STEPS[id].slice(0,count)}
	return st

static func migrate_activities(activities: Dictionary,story: Dictionary) -> Dictionary:
	var result=activities.duplicate(true)
	for id in STEPS:
		var proved=PROOFS[id].any(func(p):return p in story.get("uniques",[]) or p in story.get("objectives",[]))
		if result.has(id) or proved:result[id]=normalize(id,result.get(id,{}),story)
	return result

static func valid_activity(id: String,st: Dictionary) -> bool:
	if not STEPS.has(id):return false
	# Existing validator still validates legacy step/values/done fields.
	if not st.has("mechanism"):return true
	var mechanism=st.mechanism
	if not mechanism is Dictionary or mechanism.size()!=2 or mechanism.get("format")!=1:return false
	var milestones=mechanism.get("milestones")
	if not milestones is Array or milestones.size()>STEPS[id].size():return false
	if milestones!=STEPS[id].slice(0,milestones.size()):return false
	if st.get("done")!=(milestones.size()==STEPS[id].size()):return false
	if id not in ["power","array"] and st.get("step")!=milestones.size():return false
	if id=="power" and not milestones.is_empty() and not power_solved(st.values):return false
	if id=="array":
		for i in mini(milestones.size(),3):
			if absf(st.values[i]-[25,60,85][i])>2:return false
	return true

static func next_step(id: String,st: Dictionary) -> String:
	var count=st.mechanism.milestones.size()
	return "" if count>=STEPS[id].size() else STEPS[id][count]

static func refusal(id: String,st: Dictionary,action: String) -> String:
	if action not in STEPS.get(id,[]):return "Unknown service operation."
	if action in st.mechanism.milestones:return ""
	if action!=next_step(id,st):return "First: "+control(id,next_step(id,st)).label+"."
	if id=="power" and action=="bus" and not power_solved(st.values):return "Allocate RECOVERY 2 / TRACKING 1 / FURNACE 0 before committing the bus."
	if id=="array" and action!="lock":
		var index=STEPS[id].find(action)
		if absf(st.values[index]-[25,60,85][index])>2:return "Set this wheel to its engraved calibration tick before latching it."
	return ""

static func commit(id: String,st: Dictionary,action: String) -> bool:
	if refusal(id,st,action)!="":return false
	if action in st.mechanism.milestones:return true
	st.mechanism.milestones.append(action)
	if id not in ["power","array"]:st.step=st.mechanism.milestones.size()
	st.done=st.mechanism.milestones.size()==STEPS[id].size()
	return true

static func control(id: String,action: String) -> Dictionary:
	for spec in CONTROLS.get(id,[]):
		if spec.id==action:return spec
	return {}

static func moving_step(id: String,action: String) -> bool:
	return (id=="power" and action=="move") or (id=="gyro" and action=="release") or (id=="array" and action=="lock") or (id in ["port","starboard"] and action=="energize") or (id=="archive" and action=="seat") or (id=="transmitter" and action=="synchronize")

static func power_solved(values: Array) -> bool:
	return values.size()==3 and float(values[0])==2.0 and float(values[1])==1.0 and float(values[2])==0.0

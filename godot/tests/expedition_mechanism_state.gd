extends SceneTree

const Mechanisms=preload("res://scripts/expedition_mechanisms.gd")
var checks=0
var failures=[]

func check(ok: bool,label: String):
	checks+=1
	print("PASS " if ok else "FAIL ",label)
	if not ok:failures.append(label)

func _initialize():
	for id in Mechanisms.STEPS:
		var st=Mechanisms.fresh()
		check(Mechanisms.valid_activity(id,st),id+": fresh physical state validates")
		var last=Mechanisms.STEPS[id].back()
		check(not Mechanisms.commit(id,st,last),id+": later operation cannot bypass earlier controls")
		for action in Mechanisms.STEPS[id]:
			if id=="power" and action=="bus":
				check(not Mechanisms.commit(id,st,action),"Foundry invalid allocation does not release recovery access")
				st.values=[2,1,0]
			if id=="array" and action!="lock":
				var index=Mechanisms.STEPS.array.find(action)
				st.values[index]=[25,60,85][index]-3
				check(not Mechanisms.commit(id,st,action),"Array refuses outside tolerance "+action)
				st.values[index]+=1
			check(Mechanisms.commit(id,st,action),id+": accepts ordered "+action)
			var saved=JSON.parse_string(JSON.stringify(st))
			check(Mechanisms.valid_activity(id,saved),id+": JSON partial state validates "+action)
			var count=st.mechanism.milestones.size()
			check(Mechanisms.commit(id,st,action) and st.mechanism.milestones.size()==count,id+": repeating "+action+" is idempotent")
		check(st.done,id+": final physical action releases access")
		var malformed=st.duplicate(true);malformed.mechanism.milestones.reverse()
		check(not Mechanisms.valid_activity(id,malformed),id+": reordered forged milestones rejected")
		malformed=st.duplicate(true);malformed.mechanism.format=2
		check(not Mechanisms.valid_activity(id,malformed),id+": unknown mechanism version rejected")
		for step in 3:
			var old={"step":step,"values":[1,2,3],"done":false}
			var migrated=Mechanisms.normalize(id,old,{})
			check(migrated.values==old.values and migrated.mechanism.milestones.size()==(0 if id in ["power","array"] else step),id+": preserves legacy partial operation "+str(step))
		var old_done={"step":3,"values":[2,1,0] if id=="power" else [25,60,85],"done":true}
		var done=Mechanisms.normalize(id,old_done,{})
		check(done.done and Mechanisms.valid_activity(id,done),id+": legacy completion remains complete")
		for proof in Mechanisms.PROOFS[id]:
			var restored=Mechanisms.migrate_activities({},{"uniques":[proof],"objectives":[]})
			check(restored.has(id) and restored[id].done,id+": earned fact proves shared activity completion "+proof)
		var before=Mechanisms.normalize(id,{},{});var roundtrip=Mechanisms.normalize(id,before,{})
		check(before==roundtrip,id+": fresh migration is repeat-safe")
	var partial=Mechanisms.normalize("array",{"step":0,"values":[25,60,85],"done":false},{})
	check(not partial.done and partial.mechanism.milestones.is_empty(),"Solved uncommitted legacy Array values never invent completion")
	var route=Mechanisms.migrate_activities({},{"objectives":["orchard-port-isolator"]})
	check(route.port.done and not route.has("starboard"),"Orchard route supplies only its intact isolator")
	print("EXPEDITION_STATE_RESULT ",JSON.stringify({"checks":checks,"failures":failures}))
	quit(0 if failures.is_empty() else 1)

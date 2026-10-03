class_name MMFJourney
extends RefCounted

const BRIEFS=[
	"The wreck carries a course gyro. Recover it to give the Nomad a reliable bearing.",
	"The Foundry holds salvage and tracking hardware. Recover both to open specialist machine upgrades.",
	"Align the Quiet Array and preserve Annika's archive. Its actuator will let the Nomad change course.",
	"Restore the Orchard's archive isolators. Carry its living seeds and memories onward, then recover the governor.",
	"Restore the Meridian transmitter and install the archive. Its solution will reveal the final refuge bearing."
]
var game
var queue: Array=[]
var current: Dictionary={}
var remaining=0.0
var quiet_until=0.0
var last_phase=""
var last_uniques: Array=[]
var objective_key=""
var idle=0.0
var reminded=false
var practical_left=0.0

func reset(recap: bool=false):
	queue.clear();current.clear();remaining=0;quiet_until=0;idle=0;reminded=false;objective_key=""
	last_phase=game.session.story.phase
	last_uniques=game.session.story.uniques.duplicate()
	practical_left=0.0
	if recap: enqueue("recap","LAST CONNECTION",brief()+"\n"+game.session.objective(),true)

func brief() -> String:
	if game.session.story.phase in ["locked","signal","crossfire","raids"]: return game.session.objective()
	if game.session.story.phase=="complete": return "The Meridian bearing is preserved. The Nomad keeps walking."
	return BRIEFS[clampi(int(game.session.story.index),0,4)]

func enqueue(id: String,speaker: String,message: String,transient: bool=false):
	if not transient and id in game.session.polish.seen: return
	if current.get("id","")==id: return
	for pending in queue:
		if pending.id==id: return
	var priority=4 if id=="recap" else 3 if id.begins_with("narrative/") or id.begins_with("finale/") or id.begins_with("mission/completed/") or id.ends_with("/dock") or id.ends_with("/depart") else 2 if id.begins_with("reward/") else 0 if id=="hint" else 1
	queue.append({"id":id,"speaker":speaker,"text":message,"transient":transient,"chapter":game.session.story.index,"priority":priority})
	queue.sort_custom(func(a,b):return a.priority>b.priority)
	if queue.size()>8: queue.pop_back()

func survives_chapter(id: String) -> bool:
	return id.begins_with("narrative/") or id.begins_with("mission/completed/") or id.begins_with("finale/") or id.begins_with("radar/") or id.begins_with("gear/") or id.begins_with("reward/") or id.begins_with("l12/") or id in ["survivor/refuge-repaired","survivor/refuge-later","survivor/workshop-bearing"]

func update(dt: float):
	var s=game.session
	if not game.started: return
	practical_left-=dt
	if practical_left<=0:
		practical_left=1.0
		for message in MMFCampaignFlow.messages(s):enqueue(message.id,message.speaker,message.text)
	var phase=s.story.phase
	if not current.is_empty() and current.chapter!=s.story.index and not survives_chapter(current.id): current.clear()
	if phase!=last_phase:
		last_phase=phase
		var chapter=game.campaign.expedition()
		if phase=="approach": enqueue(chapter.id+"/depart","NAVIGATION",brief())
		if phase=="docked": enqueue(chapter.id+"/dock","LOCAL LINK",chapter.title+" connected. Follow the elevated gangway. "+brief())
	for id in s.story.uniques:
		if id not in last_uniques:
			last_uniques.append(id)
			enqueue("reward/"+id,"RECOVERY LOG",reward_text(id))
			if s.caretaker.recovered and id in ["annika-archive-shard","human-seed-bank","orchard-memory-core"]: enqueue("l12/"+id,"L–12", "Archive transfer verified. The names are safe aboard." if id!="human-seed-bank" else "Seed enclosure stable. I will keep watch over it.")
	# Progress keys exclude changing percentages/metres: they must not reset idle guidance.
	var next_key="%s/%s/%s/%s/%s"%[phase,s.scanner.phase,s.facts,s.story.uniques,s.story.objectives]
	if next_key!=objective_key: objective_key=next_key;idle=0;reminded=false
	if game.menu_open or game.cinematic!="" or s.health<=0 or game.combat.active_threat() or game.building.selected!="" or game.salvage.busy() or Input.is_action_pressed("use") or Input.is_action_pressed("aim"): return
	if not current.is_empty():
		remaining-=dt
		if remaining<=0: current.clear()
	elif not queue.is_empty():
		var pending=queue.pop_front()
		if pending.id.begins_with("flow/"):
			var fresh=MMFCampaignFlow.messages(s).filter(func(message):return message.id==pending.id)
			if fresh.is_empty():return
			pending.text=fresh[0].text;pending.speaker=fresh[0].speaker
		if pending.id.begins_with("mission/offer/") and (s.contacts.active.get("state","")!="detected" or MMFMissions.contact_mission(s.contacts.active)!=pending.id.trim_prefix("mission/offer/")):return
		if pending.id=="survivor/refuge-offer" and (s.contacts.active.get("kind","")!="friendly-refuge" or s.contacts.active.get("state","")!="detected"):return
		if pending.id=="survivor/workshop-bearing" and s.contacts.active.get("kind","")!="rooftop-workshop":return
		if pending.chapter!=s.story.index and not survives_chapter(pending.id): return
		current=pending;remaining=clampf(game.hint(pending.text).length()/14.0,7,16)
		if not pending.transient:
			s.polish.seen.append(pending.id)
			s.polish.log.append({"speaker":pending.speaker,"text":pending.text})
			if s.polish.log.size()>64: s.polish.log.pop_front()
			if pending.id=="survivor/refuge-later":s.survivor_content.refuge.acknowledged=true
			if pending.id.ends_with("/depart") or pending.id.ends_with("/dock"): quiet_until=s.clock+remaining+8
		elif pending.id=="hint":MMFWristLog.append(s,"Service note · "+pending.text)
		# Written receiver traffic is archived silently. Actual dialogue uses the
		# cinematic subtitle path; routine guidance does not interrupt the view.
	idle+=dt
	if idle>=120 and not reminded and game.settings.get("objective_reminders",true):
		reminded=true
		enqueue("hint","SERVICE NOTE",s.objective(),true)

func reward_text(id: String) -> String:
	var descriptions={"course-gyro":"Course gyro secured. A bearing dial is now fitted at the helm.","salvage-controller":"Salvage controller secured. The Salvage drone dock is now available in Build.","tracking-servo":"Tracking servo secured. The Automatic Defense Turret is now available in Build.","course-actuator":"Course actuator secured. Helm steering is available to ±12 degrees.","annika-archive-shard":"Annika's archive is preserved. Its readout is now beside the receiver.","human-seed-bank":"The Orchard seeds are aboard. A preservation tray is mounted beside the receiver; a seed preservation display can now be built.","orchard-memory-core":"Orchard memory core secured. Keep it for the Meridian archive cradle.","vector-governor":"Vector governor fitted at the helm. Steering range increased to ±28 degrees.","meridian-solution":"Meridian solution preserved. Review the final bearing at the helm when ready."}
	return descriptions.get(id,id.replace("-"," ")+" secured.")

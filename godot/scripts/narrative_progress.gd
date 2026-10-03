class_name MMFNarrativeProgress
extends RefCounted

var game
var entry={}
var comparison=false

static func defaults() -> Dictionary:
	return {"version":1,"known":[]}

static func valid(value) -> bool:
	if not value is Dictionary or value.get("version")!=1 or not value.get("known") is Array or value.known.size()>6:return false
	var seen=[]
	for id in value.known:
		if not id is String or not MMFNativeNarrativeData.BEATS.has(id) or id in seen:return false
		seen.append(id)
	return true

static func migrated(s) -> Dictionary:
	var result=defaults()
	for id in MMFNativeNarrativeData.BEATS:
		if MMFNativeNarrativeData.BEATS[id].fact in s.story.uniques:result.known.append(id)
	return result

func observe():
	var s=game.session
	for id in MMFNativeNarrativeData.BEATS:
		if id in s.narrative.known:continue
		var beat=MMFNativeNarrativeData.BEATS[id]
		if beat.fact!="" and beat.fact in s.story.uniques:
			s.narrative.known.append(id)
			game.journey.enqueue("narrative/"+id,beat.speaker,beat.text)
			s.transaction.emit("story_evidence",{"beat":id})
			if id=="array-false-corridor" and MMFMissionContracts.completed(s,"stranded-courier"):
				game.journey.enqueue("narrative/courier-array","COURIER","Your recovered checksum agrees with the fixed reference. The advertised corridor was altered.")
			if id=="orchard-names-and-seeds" and s.caretaker.recovered:
				game.journey.enqueue("narrative/l12-orchard","L–12","The drawers are stable. I can keep watch while you choose where we go.")
			if id=="meridian-trusted-bearing" and s.survivor_content.refuge.repaired:
				game.journey.enqueue("narrative/r9-meridian","R-9","Your repair kept this relay answering. I can hear the receiving handshake from here. Keep a way back to your deck.")

static func recap(s) -> String:
	var lines=[]
	for id in s.narrative.known:
		var beat=MMFNativeNarrativeData.BEATS[id];lines.append(beat.title+"\n"+beat.text)
	if lines.is_empty():return "You escaped onto the Nomad. Recover supplies, repair the receiver and decide what to follow."
	var last=MMFNativeNarrativeData.BEATS[s.narrative.known.back()]
	return "\n\n".join(lines)+"\n\nCURRENT LEAD: "+last.lead

func open(item: Dictionary):
	entry=item.duplicate(true);comparison=false;game.open_station("Story","story-instrument",item.id)

func authorized() -> bool:
	return game.menu_open and game.ui.page=="Story" and game.ui.station_kind=="story-instrument" and not entry.is_empty() and game.activity.interaction_refusal(entry)=="" and entry.beat in game.session.narrative.known

func render(ui):
	if not authorized():ui.text_line("Return to the recovered signal's local reader.");return
	var beat=MMFNativeNarrativeData.BEATS[entry.beat]
	ui.section(beat.title,beat.speaker)
	if entry.beat=="array-false-corridor":
		ui.text_line("FIXED REFERENCE: civilian service lane\nORDER BROADCAST: patrol corridor\n"+("COURIER CHECKSUM: matches fixed reference" if MMFMissionContracts.completed(game.session,"stranded-courier") else "MAINTENANCE NOTE: the fixed port reference was independently calibrated."))
		ui.button("COMPARE BOTH REFERENCES",func():
			if authorized():comparison=true;ui.refresh())
		if comparison:ui.text_line("MISMATCH CONFIRMED · The public bearing was changed.\n"+beat.text)
	else:ui.text_line(beat.text)
	ui.text_line("NEXT: "+beat.lead)

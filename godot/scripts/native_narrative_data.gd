class_name MMFNativeNarrativeData
extends RefCounted

const BEATS={
	"wake-dispatch":{"fact":"course-gyro","title":"A damaged dispatch","speaker":"ANNIKA / RECORDED","text":"I kept the civilian line open. Someone is replacing its bearings with obstruction reports. The Foundry's service reader can identify the routing mark.","lead":"Compare the dispatch with the Foundry's recovered service hardware."},
	"foundry-routing-mark":{"fact":"tracking-servo","title":"The same routing mark","speaker":"FOUNDRY / SERVICE RECORD","text":"Routing mark matched: CUSTODIAN ORDER. Travellers were classified as obstructions. The Quiet Array keeps an independent reference; compare both bearings there.","lead":"Continue to the Quiet Array, or answer the courier's optional signal first."},
	"array-false-corridor":{"fact":"annika-archive-shard","title":"An honest reference","speaker":"ANNIKA / RECORDED","text":"The advertised civilian corridor leads into the patrol line. S-07 carried passengers before this war. You are one of many we tried to help, not an assignment. There are seeds and family records at the Orchard. Carry them if you choose.","lead":"Reach the Glass Orchard and recover its seeds and memories."},
	"orchard-names-and-seeds":{"fact":"vector-governor","title":"Something to carry onward","speaker":"ORCHARD / CARETAKER RECORD","text":"These drawers hold beans, millet and the names of those who planted them. Meridian maintained a receiving channel. Restore that connection; a working refuge needs more than a monument.","lead":"Restore Meridian's transmitter and install the Orchard memory core."},
	"meridian-trusted-bearing":{"fact":"meridian-solution","title":"A receiving berth","speaker":"MERIDIAN / VERIFIED RECORD","text":"The independent references agree. A receiving berth still answers its maintenance handshake. That proves equipment remains, not who is alive there. Bring the seeds and transmit the archive copy. Decide how others may follow.","lead":"Review the final operation at the helm. Service the Nomad before committing."},
	"berth-keep-the-channel":{"fact":"","title":"Keep the channel open","speaker":"RECEIVING BERTH","text":"Seed enclosure stable. Archive copy verified. A place is ready for the next traveller. No one has promised who will arrive; the channel can still be kept open.","lead":"Return aboard when ready. The Nomad can keep walking."}
}
const MISSIONS={
	"stranded-courier":{"title":"A stranded courier","index":2,"description":"A service courier is stranded on a raised charging platform directly ahead. Reel its loose coupling, then reconnect the cradle. No materials required. A checksum and a small supply cache are offered.","speaker":"COURIER / OPEN CHANNEL"},
	"roof-supplies":{"title":"Supplies for the next roof","index":3,"description":"An elevated dispatch relay needs 2 components and 4 fuel items, then a local bus restart. Its downstream crew will reserve 8 fuel items at the Orchard return station. Tank fuel is never donated.","speaker":"RELAY CARETAKER"},
	"quiet-watch":{"title":"Quiet the watch","index":4,"description":"An Order retransmitter watches the final receiving link. Isolate and cut its uplink, or use one signal decoy at its test port. This prevents one identified interception during the final operation; existing route patrols remain.","speaker":"MAINTENANCE BAND"}
}
const MISSION_IDS=["stranded-courier","roof-supplies","quiet-watch"]

static func apply(data: Dictionary):
	for id in MISSIONS:data.OPPORTUNITIES["mission-"+id]={"title":MISSIONS[id].title}
	for chapter in data.STORY_EXPEDITIONS:
		for journal in chapter.journals:
			if journal.id=="quiet-array-journal-starboard":
				journal.text="LINEKEEPER / STARBOARD REFERENCE\n\nMatch the return to the fixed port reference, then release the actuator. Twelve degrees either side of the automatic line will reach the stores beyond the patrol road.\n\nS-07 is one of many passenger carriers on ANNIKA's protected register. It is a record of people helped, not a task assigned. Where you go now is yours to decide. — Tomas Hale"
		var beat=""
		for id in BEATS:
			if BEATS[id].fact in chapter.requiredUniques:beat=id
		if beat=="":continue
		var point={}
		for entry in chapter.interactables:
			if entry.get("factId","")==BEATS[beat].fact:point=entry.duplicate(true)
		if not point.is_empty() and not chapter.interactables.any(func(p):return p.id=="narrative-"+beat):
			point.id="narrative-"+beat;point.kind="narrative";point.label="Review recovered signal";point["beat"]=beat
			point.erase("activity");point.erase("factId");chapter.interactables.append(point)

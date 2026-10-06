extends SceneTree

var checks=0
var failures=[]
class Context extends RefCounted:
	var session
	var cinematic="opening"
class CinemaClock extends RefCounted:
	var time=0.0

func check(ok: bool, label: String):
	checks+=1
	if not ok:failures.append(label);push_error(label)

func _initialize():call_deferred("run")
func run():
	var data=MMFAssets.json("res://data/definitions.json")
	MMFNativeProgression.apply(data)
	var s=MMFSession.new(data)
	var context=Context.new();context.session=s
	var contacts=MMFOpportunities.new();contacts.game=context
	s.distance=1000;s.lateral=0
	var c={"atDistanceM":900.0,"worldX":40.0,"expiresAtM":1080.0}
	var before=s.native_snapshot()
	var p=contacts.preview(c)
	check(p.passed and not p.reachable and is_equal_approx(p.range,sqrt(11600.0)),"Passed contact reports true slant range and cannot be reached")
	check(contacts.preview_summary(c).contains("BEHIND THE NOMAD"),"Passed contact no longer appears at zero metres ahead")
	c.atDistanceM=1100;c.expiresAtM=980
	check(contacts.preview(c).window_closed and contacts.preview_summary(c).contains("WINDOW CLOSED"),"Expired window ahead is distinct from a passed site")
	for state in ["committed","docked","visited","departing"]:
		c["state"]=state
		var expected={"committed":"APPROACHING","docked":"DOCKED AT SIGNAL","visited":"DOCKED AT SIGNAL","departing":"CLEARING SITE"}[state]
		check(contacts.preview_summary(c).contains(expected) and not contacts.preview_summary(c).contains("WINDOW CLOSED"),"Accepted stop status replaces expiry warning: "+state)
	c.state="detected"
	c.atDistanceM=1500;c.expiresAtM=1480
	check(not contacts.preview(c).passed and not contacts.preview(c).window_closed,"Live forward signal retains its window")
	check(s.native_snapshot()==before,"Contact presentation does not mutate saves or progression")
	s.facts.salvage=true;s.scanner.phase="scanning"
	var task=MMFObjectiveGuide.describe(s)
	check(task.id=="scan" and task.action.contains("works on its own") and task.action.contains("{key:build}"),"Quiet scan gives autonomous-work explanation and a usable next action")
	var clock= CinemaClock.new()
	var prelude=MMFOpeningPrelude.new();prelude.game=context;prelude.cinema=clock;prelude.active=true
	clock.time=1.9-MMFOpeningPrelude.DURATION
	check(not prelude.can_finish_reading(),"Opening New Game key cannot immediately dismiss the letter")
	clock.time=10-MMFOpeningPrelude.DURATION
	check(prelude.can_finish_reading(),"Reader can continue before the automatic timer")
	clock.time=MMFOpeningLetter.READ_END-MMFOpeningPrelude.DURATION
	check(not prelude.can_finish_reading(),"Repeated Enter cannot skip the hold or burn")
	check(is_equal_approx(MMFOpeningLetter.BURN_START-MMFOpeningLetter.READ_END,2.0),"Two-second final line hold remains intact")
	check(is_equal_approx(MMFOpeningLetter.BURN_END-MMFOpeningLetter.BURN_START,5.0),"Full paper burn remains intact")
	prelude.letter.free();prelude.free();contacts.free()
	print(JSON.stringify({"checks":checks,"failures":failures}))
	quit(0 if failures.is_empty() else 1)

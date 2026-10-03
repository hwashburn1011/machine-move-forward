class_name MMFEnemyTells
extends RefCounted

# Read the existing controller's decisions. This helper never changes an attack,
# target, movement, cooldown, hit shape, animation, reward or gameplay random draw.
const WARNING_STATES=["rifle_lock","burst_lock","relay_lock","blade_commit"]
const DIRECTION_STATES=["rifle_lock","burst_lock","relay_lock","blade_commit","blade_lunge"]
static var arrow_mesh: ArrayMesh
var enemy
var arrow: MeshInstance3D
var state=""
var drone_was_alive=true
var drone_break_left=0.0
var cue_count=0

static func direction_mesh() -> ArrayMesh:
	if arrow_mesh:return arrow_mesh
	var arrays=[];arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX]=PackedVector3Array([
		Vector3(-.09,0,.35),Vector3(.09,0,.35),Vector3(.09,0,1),
		Vector3(-.09,0,.35),Vector3(.09,0,1),Vector3(-.09,0,1),
		Vector3(-.29,0,.83),Vector3(.29,0,.83),Vector3(0,0,1.3)])
	arrays[Mesh.ARRAY_NORMAL]=PackedVector3Array([Vector3.UP,Vector3.UP,Vector3.UP,Vector3.UP,Vector3.UP,Vector3.UP,Vector3.UP,Vector3.UP,Vector3.UP])
	arrow_mesh=ArrayMesh.new();arrow_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES,arrays)
	return arrow_mesh

func setup(owner_enemy):
	enemy=owner_enemy;drone_was_alive=enemy.drone_health>0
	arrow=MeshInstance3D.new();arrow.name="CommittedIntentDirection"
	arrow.mesh=direction_mesh();arrow.material_override=enemy.WARNING_DANGER
	arrow.position.y=.028;arrow.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	arrow.visible=false;enemy.add_child(arrow)

func current_state() -> String:
	if enemy.dead or enemy.inactive:return ""
	if enemy.kind=="revenant":
		if enemy.phase=="telegraph":return "blade_commit"
		if enemy.phase=="lunge":return "blade_lunge"
		if enemy.phase=="recovery":return "blade_recover"
	if enemy.windup>0:
		return "burst_lock" if enemy.kind=="bastion" else "relay_lock" if enemy.kind=="sovereign" else "rifle_lock"
	if enemy.kind=="bastion":
		if enemy.phase=="vent":return "vent"
		if enemy.shots_left>0:return "burst"
	if enemy.mission=="sabotage":return "sabotage"
	if enemy.game.combat.mission.carrier==enemy and enemy.game.combat.mission.objective=="theft":
		if not enemy.stolen.is_empty():return "escaping"
		if enemy.mission=="travel":return "storage"
	if enemy.kind=="sovereign":
		if enemy.drone_health>0:return "shield_relay"
		if drone_break_left>0:return "relay_broken"
	if enemy.kind in ["raider","scavenger"] and enemy.mission=="assault" and enemy.position.distance_to(enemy.game.player.position)<6:return "closing"
	return ""

func update(dt: float):
	if enemy.dead or enemy.inactive:clear();return
	drone_break_left=maxf(0,drone_break_left-dt)
	if enemy.kind=="sovereign" and drone_was_alive and enemy.drone_health<=0:
		drone_break_left=2.0
		enemy.game.audio.play_at("pressure-release",enemy.drone.global_position if is_instance_valid(enemy.drone) else enemy.global_position+Vector3.UP*1.4,.10,.88)
		cue_count+=1
	drone_was_alive=enemy.drone_health>0
	var next=current_state()
	if next!=state:
		state=next
		if state in WARNING_STATES:
			var pitch=.82 if state=="burst_lock" else 1.0 if state=="blade_commit" else .94 if state=="relay_lock" else .90
			enemy.game.audio.play_at("servo-load",enemy.equipment.shot_origin(enemy),.12,pitch);cue_count+=1
		elif state=="vent":
			enemy.game.audio.play_at("pressure-release",enemy.global_position+Vector3.UP*1.4,.12,.88);cue_count+=1
	var readable=enemy.position.distance_to(enemy.game.player.position)<=26
	# Enemy intent is carried by its actual pose, committed ground direction,
	# exposed hardware and source-located mechanics. No floating instructions.
	var text="━".repeat(maxi(1,int(enemy.health/enemy.definition.maxHealth*7)))
	if enemy.hp_label.text!=text:enemy.hp_label.text=text
	enemy.hp_label.font_size=32
	enemy.hp_label.modulate=Color(.65,.9,.79) if state in ["vent","blade_recover","relay_broken"] else Color(1,.25,.1)
	arrow.visible=readable and state in DIRECTION_STATES
	if arrow.visible:
		var direction=enemy.lunge_direction if state in ["blade_commit","blade_lunge"] else enemy.committed-enemy.position
		arrow.rotation.y=atan2(direction.x,direction.z)
	# The original controller owns ring visibility; only its presentation changes.
	var warning=enemy.WARNING_VULNERABLE if state in ["vent","blade_recover"] else enemy.WARNING_DANGER
	if enemy.tactical_marker.material_override!=warning:enemy.tactical_marker.material_override=warning

func clear():
	state="";drone_break_left=0
	if is_instance_valid(arrow):arrow.hide()

static func clear_cache():arrow_mesh=null

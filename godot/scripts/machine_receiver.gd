class_name MMFMachineReceiver
extends RefCounted

var root: Node3D
var module: Node3D
var contacts: Node3D
var progress: Node3D
var lamp: Node3D
var status: Label3D
var remaining=0.0
var last_phase=""
var last_power=false

func bind(receiver: Node3D):
	root=receiver
	module=MMFAssets.find_named(root,"ScannerModule")
	contacts=MMFAssets.find_named(root,"EmptyModuleContacts")
	progress=MMFAssets.find_named(root,"ScanProgress")
	lamp=MMFAssets.find_named(root,"SignalLamp")
	status=Label3D.new();status.name="LiveScannerStatus"
	MMFAssets.find_named(root,"ScreenStatus").add_child(status)
	status.font_size=32;status.pixel_size=.00095;status.outline_size=2
	status.double_sided=false;status.no_depth_test=false
	status.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	status.visibility_range_end=12;remaining=0

func update(dt: float,game):
	var s=game.session;var phase=s.scanner.phase;var powered=s.powered.get("fixed-radio",false)
	var fitted=phase not in ["awaiting-receiver","awaiting-module"]
	module.visible=fitted;contacts.visible=not fitted
	progress.scale.x=clampf(s.scan_fraction(),.001,1)
	progress.visible=fitted and powered and s.scanner.elapsedS>0
	lamp.visible=powered
	remaining-=dt
	if dt>0 and remaining>0 and phase==last_phase and powered==last_power:return
	remaining=.25;last_phase=phase;last_power=powered
	var text="";var color=Color(.43,.89,.72)
	if not powered:
		text="NO POWER\nCHECK SUPPLY";color=Color(.41,.45,.39)
	elif not fitted:
		text="MODULE REQUIRED\nFIT SCN-07";color=Color(.87,.60,.27)
	elif phase=="installed":text="READY TO SCAN\nOPEN SIGNAL"
	elif phase=="scanning":
		var activity="SCANNING"
		if s.attack_recent>0 or game.combat.active_threat():activity="PAUSED / THREAT";color=Color(.87,.60,.27)
		elif not game.aboard() or s.health<=0 or game.cinematic!="" or (game.menu_open and game.ui.page!="Signal"):activity="SCAN PAUSED";color=Color(.87,.60,.27)
		text="%d%% COHERENCE\n%s" % [clampi(int(s.scan_fraction()*100.0),0,100),activity]
	elif phase=="contact-ready":text="100% COHERENCE\nSTABILIZING"
	else:text="100% COHERENCE\nCONTACT ACQUIRED"
	if status.text!=text:status.text=text
	status.modulate=color;status.shaded=not powered

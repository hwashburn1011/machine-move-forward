from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def edit(name,pairs):
    p=ROOT/'godot/scripts'/name;t=p.read_text(encoding='utf-8')
    for a,b in pairs:
        if a not in t:raise RuntimeError(name+': '+a[:90])
        t=t.replace(a,b)
    p.write_text(t,encoding='utf-8',newline='\n')
edit('opportunities.gd',[
 ('var survivor_site','var survivor_site\nvar radar=MMFRouteChart.new()'),
 ('\tgame=owner_game\n','\tgame=owner_game\n\tradar.setup(self)\n'),
 ('\tif story_priority(): return\n\tvar c=chart.active','\tif story_priority(): return\n\tif radar.update():return\n\tvar c=chart.active'),
 ('\tif c.is_empty():\n\t\tif not schedule_armed:','\tif c.is_empty():\n\t\tif MMFNativeProgression.radar_ready(s):return\n\t\tif not schedule_armed:'),
 ('\tif c.state=="committed":\n\t\tvar remaining=c.atDistanceM-s.distance','\tif c.state=="committed":\n\t\tradar.patrol()\n\t\tvar remaining=c.atDistanceM-s.distance\n\t\ts.target_course=clampf(rad_to_deg(atan2(c.worldX-s.lateral,maxf(remaining,.1))),-s.navigation_limit(),s.navigation_limit())'),
 ('\t\t\tchart.visited.append(c.id)','\t\t\tradar.finish_visit()\n\t\t\tchart.visited.append(c.id)'),
 ('func preview() -> Dictionary:\n\tvar c=game.session.contacts.active','func preview(contact: Dictionary={}) -> Dictionary:\n\tvar c=game.session.contacts.active if contact.is_empty() else contact'),
 ('"fuel":ceil(sqrt(forward*forward+lateral*lateral)*0.008)','"fuel":ceil(sqrt(forward*forward+lateral*lateral)/maxf(2,7.5*game.session.modifiers().speedMultiplier)*.06*game.session.modifiers().fuelBurnMultiplier*maxi(1,game.session.structures.filter(func(piece):return piece.definitionId=="generator" and piece.health>0).size()))'),
 ('\tvar p=preview()\n\tif not p.reachable:', '\tif MMFNativeProgression.radar_ready(s) and not radar.powered():s.notify("Receiver power is required to intercept a signal.");return false\n\tif s.distance>c.expiresAtM:return false\n\tvar p=preview()\n\tif not p.reachable:'),
 ('\tif c.kind in MMFSurvivorSite.KINDS:\n','\tif c.kind.begins_with("gear-"):\n\t\tsurvivor_site=MMFGearSite.new();survivor_site.setup(self,site)\n\t\tsite.position=Vector3(19,16.03,game.session.distance-c.atDistanceM)\n\t\treturn\n\tif c.kind in MMFSurvivorSite.KINDS:\n'),
 ('\tif chart.active.get("state","")!="detected":return false','\tif chart.active.get("state","")!="detected":return false\n\tif radar.dismiss_selected():return true'),
 ('\treturn "Optional elevated stop. Return aboard before departure."','\tvar kind=game.session.contacts.active.get("kind","")\n\tif kind.begins_with("gear-"):return "Isolate the feed, release the locks, and recover the machine assembly. Return aboard to install it. This stop is optional."\n\treturn "Optional elevated stop. Return aboard before departure."')
])
edit('ui.gd',[
 ('\tvar contact=s.contacts.active\n','\tgame.opportunities.radar.render(self)\n\tvar contact=s.contacts.active\n'),
 ('preview.remaining,preview.bearing,preview.fuel])','preview.remaining,preview.bearing,preview.fuel])'),
 ('func():game.opportunities.commit(),preview.reachable)','func():game.opportunities.commit(),preview.reachable and (not MMFNativeProgression.radar_ready(s) or game.opportunities.radar.powered()))')
])
edit('terminal_pages.gd',[
 ('\tfor id in game.data.BUILD_PIECE_ORDER:\n','\tfor id in game.data.BUILD_PIECE_ORDER:\n\t\tif id in MMFNativeProgression.MODULES and id not in game.session.expedition_gear.recovered:continue\n'),
 ('"seed-garden":"Human seed bank"','"seed-garden":"Human seed bank"')
])
edit('salvage.gd',[
 ('"claimed":"parked" if c.claimed in ["parked","manual"] else ""','"claimed":"parked" if c.claimed in ["parked","manual"] else "","heavy":c.get("heavy",false),"elevated":c.get("elevated",false)'),
 ('\t\tc.contents=entry.contents.duplicate();','\t\tc.contents=MMFNativeProgression.supplies(entry.contents);set_heavy(c,entry.get("heavy",false)==true);c.elevated=entry.get("elevated",false)==true;'),
 ('\t\tvar node=MMFAssets.scene("models/authored/salvage-chest.glb")','\t\tvar node=Node3D.new()\n\t\tvar regular=MMFAssets.scene("models/authored/salvage-chest.glb");node.add_child(regular)\n\t\tvar heavy=MMFNativeProgression.model("heavy-cargo");node.add_child(heavy);heavy.hide()'),
 ('"slope":Vector2.ZERO,"ground":{}}','"slope":Vector2.ZERO,"ground":{},"normalModel":regular,"heavyModel":heavy,"heavy":false,"elevated":false}'),
 ('if not c.active or c.claimed not in ["","parked"]:', 'if not c.active or c.get("heavy",false) or c.claimed not in ["","parked"]:'),
 ('\tvar at=c.node.position;var x=','\tif c.get("elevated",false):return\n\tvar at=c.node.position;var x='),
 ('game.session.speed*0.42*dt','game.session.speed*(1.0 if c.get("elevated",false) else .42)*dt'),
 ('if not c.active or c.claimed not in ["",p.instanceId]','if not c.active or c.get("heavy",false) or c.claimed not in ["",p.instanceId]'),
 ('\tupdate_hook(dt)\n','\tupdate_hook(dt)\n\tupdate_cranes(dt)\n'),
 ('\t\tc.opened=false\n\t\tc.ground.clear()','\t\tc.opened=false\n\t\tset_heavy(c,false);c.elevated=false\n\t\tc.ground.clear()'),
 ('func spawn():\n','func spawn():\n\tif "salvage-crane" in game.session.expedition_gear.recovered and int(game.session.distance/90)%4==0:\n\t\tif spawn_heavy(Vector3(20,2,-42)):return\n')
])
edit('combat.gd',[('func drop_loot(at: Vector3,id: String,count: int):','func drop_loot(at: Vector3,id: String,count: int):\n\tid=MMFNativeProgression.RETIRED_ITEMS.get(id,id)')])
edit('scout_encounter.gd',[('dt/18.0 if searching','dt/(36.0 if MMFNativeProgression.quiet_running(game.session) else 18.0) if searching')])
edit('journey.gd',[('return id.begins_with("reward/")','return id.begins_with("radar/") or id.begins_with("gear/") or id.begins_with("reward/")')])
print('Radar and equipment integrated')

"""One-time integration edits for the native robot-only survival loop."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def edit(name, replacements):
    path=ROOT/'godot/scripts'/name
    text=path.read_text(encoding='utf-8')
    for old,new in replacements:
        if old not in text: raise RuntimeError(f'{name}: missing {old[:100]!r}')
        text=text.replace(old,new)
    path.write_text(text,encoding='utf-8',newline='\n')
edit('session.gd',[
 ('"condenser": 4, ',''),
 ('var hydration = 100.0\nvar nourishment = 100.0\n',''),
 ('var fieldwork_active = false','var expedition_gear=MMFNativeProgression.gear_defaults()\nvar battery_draw=0.0\nvar fieldwork_active = false'),
 ('\tdata = definitions','\tMMFNativeProgression.apply(definitions)\n\tdata = definitions'),
 ('\tif id in ["planter", "condenser", "seed-garden"]: instance.state = {"elapsedS": 0.0, "stored": 0, "water": 0}','\tif id=="battery-bank":instance.state={"charge":0.0}'),
 ('\t\t"water":\n\t\t\tif hydration >= 100: return false\n\t\t\thydration = minf(100, hydration + 60)\n\t\t"rations":\n\t\t\tif nourishment >= 100: return false\n\t\t\tnourishment = minf(100, nourishment + 60)\n',''),
 ('health + 40*(0.5 if nourishment<=0 else 1)','health + 40'),
 ('\tif opening_done:\n\t\t# Weather changes visibility and ambience, not resource consumption.\n\t\thydration = maxf(0, hydration - dt*float(data.HYDRATION_DRAIN_PER_S))\n\t\tnourishment = maxf(0, nourishment - dt*float(data.NOURISHMENT_DRAIN_PER_S))\n',''),
 ('"health": health, "hydration": hydration, "nourishment": nourishment, "subsystems": subsystems,','"health": health, "subsystems": subsystems, "expeditionGear":expedition_gear,'),
 ('\thydration = clampf(raw.get("hydration", 100), 0, 100)\n\tnourishment = clampf(raw.get("nourishment", 100), 0, 100)\n',''),
 ('\tcontacts=raw.get("contacts",{"nextSlot":1,"active":{},"visited":[],"missed":[]}).duplicate(true)','\tcontacts=raw.get("contacts",{"nextSlot":1,"active":{},"visited":[],"missed":[]}).duplicate(true)\n\tcontacts["candidates"]=contacts.get("candidates",[])\n\tfor contact in contacts.candidates+[contacts.active]:\n\t\tif contact.is_empty():continue\n\t\tif contact.kind=="water-cache":contact.kind="fuel-cache"\n\t\tcontact.rewards=MMFNativeProgression.supplies(contact.rewards)\n\tfor contact in contacts.candidates:\n\t\tif contact.id==contacts.active.get("id",""):contacts.active=contact;break\n\texpedition_gear=raw.get("expeditionGear",MMFNativeProgression.gear_defaults()).duplicate(true)\n\tcaretaker.mode="companion";caretaker.priority="auto"'),
 ('\treturn result\n\nfunc begin_research','\tif MMFNativeProgression.quiet_running(self):\n\t\tresult.speedMultiplier*=.65;result.generationBonus-=4\n\treturn result\n\nfunc begin_research'),
 ('\tif not data.BUILD_PIECES.has(id): return {}','\tif not data.BUILD_PIECES.has(id): return {}\n\tif not free and (id in MMFNativeProgression.RETIRED_PIECES or id in MMFNativeProgression.MODULES and id not in expedition_gear.recovered):return {}')
])
p=ROOT/'godot/scripts/session.gd';t=p.read_text(encoding='utf-8')
start=t.index('\tfor p in structures:\n\t\tvar kind = p.definitionId', t.index('func tick('))
end=t.index('\nfunc objective()',start)
t=t[:start]+t[end:]
start=t.index('\t\tif p.definitionId in ["condenser","planter","seed-garden"]:',t.index('func restore_native'))
end=t.index('\t\tif p.definitionId in ["crate", "collector-auto"]:',start)
t=t[:start]+'''\t\tif p.definitionId in MMFNativeProgression.RETIRED_PIECES or p.definitionId=="seed-garden":
\t\t\tvar stock=p.state.get("legacyStock",{}).duplicate()
\t\t\tvar item="fuel" if p.definitionId=="condenser" else "scrap"
\t\t\tstock[item]=stock.get(item,0)+int(p.state.get("stored",0))
\t\t\tstock["fuel"]=stock.get("fuel",0)+int(p.state.get("water",0))
\t\t\tp.state={"legacyStock":stock}
'''+t[end:]
p.write_text(t,encoding='utf-8',newline='\n')
edit('main.gd',[
 ('MMFNativeSurvivorData.apply(data,runtime)','MMFNativeSurvivorData.apply(data,runtime)\n\tMMFNativeProgression.apply(data)\n\tMMFNativeProgression.runtime_contract(runtime)'),
 ('"workbench","refinery","stove": open_menu("Workshop")','"workbench","refinery": open_menu("Workshop")'),
 ('"generator","turret-manual","chair"]','"generator","turret-manual","chair","salvage-crane","battery-bank","quiet-drive"]'),
 ('\t\t"condenser","planter","seed-garden":\n\t\t\tvar id="water" if p.definitionId=="condenser" else "greens"\n\t\t\tvar stored=int(p.state.get("stored",0))\n\t\t\tp.state.stored=session.add_resource(id,stored)\n\t\t\tif p.definitionId=="seed-garden" and p.state.get("water",0)<2 and session.pay({"water":1}): p.state.water=p.state.get("water",0)+1\n\t\t\tsession.notify("Harvest transferred. Stored: %d" % p.state.stored)',
 '''\t\t"condenser","planter","stove","seed-garden":
\t\t\tfor id in p.state.get("legacyStock",{}):p.state.legacyStock[id]=session.add_resource(id,int(p.state.legacyStock[id]))
\t\t\tsession.notify("Preserved seeds — a reminder of the Orchard." if p.definitionId=="seed-garden" else "Retired equipment. Use the cutter to recover its materials.")''')
])
edit('player.gd',[(' and state.hydration>0','')])
edit('home.gd',[('dt*2*(0.5 if game.session.nourishment<=0 else 1)','dt*2')])
edit('inventory.gd',[('for i in raw.size(): slots[i] = raw[i].duplicate() if raw[i] != null else null','for i in raw.size():\n\t\tif raw[i]==null:continue\n\t\tslots[i]=raw[i].duplicate()\n\t\tslots[i].itemId=MMFNativeProgression.RETIRED_ITEMS.get(slots[i].itemId,slots[i].itemId)')])
edit('terminal_inventory.gd',[
 ('["water","rations","repair-kit","fuel","greens","signal-decoy"]','["repair-kit","fuel","signal-decoy"]'),
 ('"water":"Water +60","rations":"Food +60",',''),
 ('[["HEALTH",s.health],["WATER",s.hydration],["FOOD",s.nourishment]]','[["HEALTH",s.health]]'),
 ('\tif id=="repair-kit" and s.nourishment<=0:effect="Health +20 · low food"\n',''),
 ('["water","rations","repair-kit","extended-mag"]','["repair-kit","extended-mag"]'),
 ('s.hydration<100 if id=="water" else s.nourishment<100 if id=="rations" else ','')
])
edit('ui.gd',[
 ('"HEALTH","WATER","FOOD","FUEL","POWER","SCAN"','"HEALTH","FUEL","POWER","SCAN"'),
 ('"WATER":"hydration","FOOD":"nourishment",',''),
 ('Health %d · Water %d · Food %d','Health %d'),
 ('s.health,s.hydration,s.nourishment,held','s.health,held'),
 ('\t\tfor mode in ["companion","steward"]: button("L–12: "+mode,func():s.caretaker.mode=mode;refresh())\n\t\tfor priority in ["auto","gardens","outputs"]: button("Work priority: "+priority,func():s.caretaker.priority=priority;refresh())','\t\ttext_line("Companion · follows you aboard")')
])
edit('save_validation.gd',[
 ('for field in ["health","fuel","hydration","nourishment"]:','for field in ["health","fuel"]:'),
 ('\t\tvar c=chart.active','\t\tvar c=chart.active')
])
edit('survivor_content.gd',[('"reward":{"water":4,"fuel":3}','"reward":{"scrap":4,"fuel":3}'),
 ('\tvar result=defaults()','\traw=raw.duplicate(true)\n\tif raw.get("refuge",{}).get("reward",{}).has("water"):\n\t\traw.refuge.reward["scrap"]=raw.refuge.reward.water;raw.refuge.reward.erase("water")\n\tvar result=defaults()')])
edit('survivor_site.gd',[('Exchange · %d water / %d fuel','Exchange · %d scrap / %d fuel'),('st.reward.water','st.reward.scrap'),('Take the water and fuel.','Take the spare metal and fuel.')])
edit('opportunities.gd',[('%d water and %d fuel','%d scrap and %d fuel'),('refuge.reward.water','refuge.reward.scrap'),('four water, three fuel','four scrap, three fuel'),('I have water and fuel to trade.','I have spare metal and fuel to trade.'),('"water-cache"','"fuel-cache"'),('{"water":4}','{"fuel":6}')])
edit('building.gd',[
 ('\tif id=="boarding-extension": return','\tif id in MMFNativeProgression.MODULES:return MMFNativeProgression.model(id)\n\tif id=="boarding-extension": return'),
 ('func unlocked(id: String) -> bool:\n','func unlocked(id: String) -> bool:\n\tif id in MMFNativeProgression.RETIRED_PIECES:return false\n\tif id in MMFNativeProgression.MODULES:return id in game.session.expedition_gear.recovered\n')
])
p=ROOT/'godot/scripts/building.gd';t=p.read_text(encoding='utf-8')
for subject in ['piece','p']:
    start=t.index('\t\tif '+subject+'.definitionId in ["condenser","planter","seed-garden"]:')
    end=t.index('\n\t',t.index('contents.water=',start))
    t=t[:start]+f'\t\tfor item in {subject}.state.get("legacyStock",{{}}):contents[item]=contents.get(item,0)+{subject}.state.legacyStock[item]'+t[end:]
p.write_text(t,encoding='utf-8',newline='\n')
edit('journey.gd',[('seed gardens can now be built.','a seed preservation display can now be built.')])
# Keep L-12's physical companion behavior, remove its retired gardening jobs.
p=ROOT/'godot/scripts/caretaker.gd';t=p.read_text(encoding='utf-8')
start=t.index('func choose_job()');end=t.index('func _physics_process',start)
t=t[:start]+'func choose_job() -> Dictionary:\n\treturn {}\n\n'+t[end:]
start=t.index('\tvar home=dock()',t.index('func update('));end=t.index('\tvelocity.x=0;velocity.z=0',start)
t=t[:start]+'''\tjob={};phase="idle";status="Following"
\tdestination=game.player.position+game.player.visual.global_basis.z*1.5
'''+t[end:]
p.write_text(t,encoding='utf-8',newline='\n')
print('Robot loop integration applied')

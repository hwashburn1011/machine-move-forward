extends SceneTree

var game
var checks=0
var failures=[]
var output="res://../test-results/v1-playthrough-fixes-20261005/construction/catalog-finish.json"

func _initialize():
	set_meta("test_mode",true);MMFSaves.DIRECTORY="user://catalog-finish-checks/";call_deferred("run")

func check(ok: bool,label: String):
	checks+=1
	if not ok:failures.append(label);push_error(label)

func rows() -> Array:
	return game.ui.content.find_children("*","Button",true,false).filter(func(b):return b.has_meta("catalog_part"))

func run():
	game=load("res://scenes/main.tscn").instantiate();root.add_child(game);current_scene=game
	game.started=true;game.close_menu();game.player.teleport(Vector3(-6,16.1,-6))
	var pages=game.terminal_pages
	pages.category="all";pages.catalog_page=0
	game.open_menu("Build")
	var ids=pages.catalog_ids();var seen=[]
	for page in ceili(float(ids.size())/pages.CATALOG_PAGE_SIZE):
		pages.catalog_page=page;game.ui.refresh()
		var visible_rows=rows()
		check(visible_rows.size()<=18 and not visible_rows.is_empty(),"bounded catalog page "+str(page))
		for row in visible_rows:
			seen.append(row.get_meta("catalog_part"))
			check(row.focus_mode==Control.FOCUS_ALL,"keyboard part "+str(row.get_meta("catalog_part")))
		for button in game.ui.content.find_children("*","Button",true,false):
			if button.has_meta("catalog_page_delta"):check(button.focus_mode==Control.FOCUS_ALL if not button.disabled else button.focus_mode==Control.FOCUS_NONE,"keyboard pager")
	check(seen==ids,"every part appears once in original order")
	pages.catalog_page=0;game.ui.refresh()
	for button in game.ui.content.find_children("*","Button",true,false):
		if button.get_meta("catalog_page_delta",0)==1:button.pressed.emit();break
	check(pages.catalog_page==1 and game.ui.preferred_focus.get_meta("catalog_page_delta",0)==1,"next callback retains pager focus")
	pages.catalog_page=ceili(float(ids.size())/pages.CATALOG_PAGE_SIZE)-2;pages.turn_catalog_page(game.ui,1)
	check(game.ui.preferred_focus.get_meta("catalog_page_delta",0)==-1,"last page focus returns to available previous control")
	pages.catalog_page=0;pages.catalog_selected=ids[0];game.ui.refresh()
	pages.catalog_page=1;game.ui.refresh()
	check(pages.catalog_selected==ids[0],"detail selection survives paging")
	check(not game.ui.content.find_children("*","Button",true,false).filter(func(b):return b.get_meta("terminal_action","")=="place:"+ids[0]).is_empty(),"selected detail remains actionable on another page")
	pages.category="favorites";game.session.polish.favorites=[ids[0],ids.back()];pages.catalog_page=90;game.ui.refresh()
	check(pages.catalog_page==0 and rows().size()==2,"favorites cover full catalog and clamp page")
	game.session.polish.favorites=[];game.ui.refresh();check(rows().is_empty() and pages.catalog_page==0,"empty favorites")
	for category in ["structure","station","decor"]:
		pages.category=category;pages.catalog_page=0;game.ui.refresh()
		check(pages.catalog_ids().all(func(id):return game.data.BUILD_PIECES[id].category==category),"filter "+category)
	# Raw import is untouched; both game instances share bounded finish variants.
	var original=load("res://assets/runtime/turret-manual.glb").instantiate()
	var first=MMFAssets.scene("runtime/turret-manual.glb");var second=MMFAssets.scene("runtime/turret-manual.glb")
	var raw=MMFAssets.of_type(original,"MeshInstance3D");var one=MMFAssets.of_type(first,"MeshInstance3D");var two=MMFAssets.of_type(second,"MeshInstance3D")
	check(raw.size()==one.size() and one.size()==two.size(),"mesh count unchanged")
	var changed=0
	for i in raw.size():
		check(raw[i].mesh==one[i].mesh and one[i].mesh==two[i].mesh,"geometry shared "+str(i))
		check(raw[i].transform==one[i].transform,"transform unchanged "+str(i))
		for surface in raw[i].mesh.get_surface_count():
			var source=raw[i].get_active_material(surface);var finish=one[i].get_active_material(surface)
			check(finish==two[i].get_active_material(surface),"finish shared "+str(i))
			if finish!=source:
				changed+=1
				check(source.albedo_texture==finish.albedo_texture and source.normal_texture==finish.normal_texture and source.roughness_texture==finish.roughness_texture,"authored maps preserved "+str(i))
				check(finish.albedo_color.get_luminance()<source.albedo_color.get_luminance() and finish.metallic<source.metallic,"muted reflective finish "+str(i))
	check(changed==6,"six steel and paint surfaces use finish")
	original.free();first.free();second.free()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output.get_base_dir()))
	var file=FileAccess.open(output,FileAccess.WRITE);file.store_string(JSON.stringify({"passed":failures.is_empty(),"checks":checks,"failures":failures,"source":MMFPlaytestRecorder.source_fingerprint()},"\t"));file.close()
	print("CATALOG_FINISH ",checks," checks; failures ",failures)
	game.open_menu("Pause");while game.combat.nav.is_baking():await create_timer(.02).timeout
	var drain=load("res://tests/audio_drain.gd");var refs=drain.capture(game.audio)
	game.queue_free();while is_instance_valid(game):await process_frame
	MMFAssets.cache.clear();await drain.finish(self,refs);quit(int(not failures.is_empty()))

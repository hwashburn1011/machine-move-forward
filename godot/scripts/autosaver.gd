class_name MMFAutosaver
extends Node

# Workers own plain, detached data only. UI messages and task harvesting stay on
# the main thread, including while the game is paused. At most one active write
# and one latest replacement snapshot are retained, so writes cannot race.
signal completed(success: bool)

class WriteJob extends RefCounted:
	var directory: String
	var payload: Dictionary
	var success=false
	func run():success=MMFSaves.write_at(directory,"autosave",payload)

var task_id=-1
var job: WriteJob
var queued: WriteJob

func _init():process_mode=Node.PROCESS_MODE_ALWAYS

func request(payload: Dictionary,directory: String) -> bool:
	if payload.is_empty():return false
	var next=WriteJob.new()
	next.directory=ProjectSettings.globalize_path(directory)
	next.payload=payload.duplicate(true)
	if task_id!=-1:
		queued=next
		return true
	return start(next)

func start(next: WriteJob) -> bool:
	job=next
	task_id=WorkerThreadPool.add_task(job.run,false,"Verify and commit native autosave")
	if task_id<0:
		job=null;completed.emit(false);return false
	return true

func pending() -> bool:return task_id!=-1

func _process(_dt):
	if task_id!=-1 and WorkerThreadPool.is_task_completed(task_id):harvest()

func harvest():
	# Completion establishes the handoff before reading the worker's result.
	WorkerThreadPool.wait_for_task_completion(task_id)
	var success=job.success
	job=null;task_id=-1
	if queued:
		var next=queued;queued=null;start(next)
	completed.emit(success)

func flush():
	# Explicit save/load and teardown wait for every acknowledged request. Normal
	# gameplay never waits here, and a stale worker cannot overwrite a loaded game.
	while task_id!=-1:harvest()

func _exit_tree():flush()

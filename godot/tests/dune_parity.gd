extends SceneTree

func _initialize():
	if DisplayServer.get_name()=="headless":push_error("Terrain parity requires a real GPU");quit(1);return
	var device=RenderingServer.create_local_rendering_device()
	var original=FileAccess.get_file_as_string("res://shaders/desert.gdshader")
	var functions=original.substr(original.find("float t_hash"),original.find("uniform float uRippleStrength")-original.find("float t_hash"))
	var regex=RegEx.new();regex.compile("uniform float [A-Za-z]+;");functions=regex.sub(functions,"",true)
	var code="#version 450\nlayout(local_size_x=64) in;\nlayout(set=0,binding=0,std430) restrict buffer Points { vec4 data[]; };\nconst float uDuneScale=62.0,uDuneHeight=5.2,uRidgeHeight=2.6,uCorridorInner=10.0,uCorridorOuter=30.0;\n"+functions+"\nvoid main(){uint i=gl_GlobalInvocationID.x;data[i].z=duneHeight(data[i].xy);}\n"
	var source=RDShaderSource.new();source.source_compute=code
	var spirv=device.shader_compile_spirv_from_source(source)
	if not spirv.compile_error_compute.is_empty():push_error(spirv.compile_error_compute);quit(1);return
	var shader=device.shader_create_from_spirv(spirv)
	var values=PackedFloat32Array()
	var ranges=[0,1000,10000,50000]
	for offset in ranges:
		for i in 1024:values.append_array(PackedFloat32Array([-50+(i%32)*3.2,-400+(i/32)*25.0-offset,0,0]))
	var buffer=device.storage_buffer_create(values.size()*4,values.to_byte_array())
	var uniform=RDUniform.new();uniform.uniform_type=RenderingDevice.UNIFORM_TYPE_STORAGE_BUFFER;uniform.binding=0;uniform.add_id(buffer)
	var set=device.uniform_set_create([uniform],shader,0)
	var pipeline=device.compute_pipeline_create(shader)
	var list=device.compute_list_begin();device.compute_list_bind_compute_pipeline(list,pipeline);device.compute_list_bind_uniform_set(list,set,0);device.compute_list_dispatch(list,64,1,1);device.compute_list_end();device.submit();device.sync()
	var result=device.buffer_get_data(buffer).to_float32_array();var peak=0.0;var mean=0.0
	var by_range={}
	for i in 4096:
		var cpu=MMFDunes.height_at(result[i*4],result[i*4+1]);var error=abs(cpu-result[i*4+2]);peak=maxf(peak,error);mean+=error
		var key=str(ranges[i/1024]);by_range[key]=maxf(by_range.get(key,0.0),error)
	var report={"samples":4096,"maxErrorMeters":peak,"meanErrorMeters":mean/4096,"maxErrorByDistanceMeters":by_range}
	print("DUNE_PARITY ",JSON.stringify(report))
	var file=FileAccess.open("res://../test-results/godot-native/dune-parity.json",FileAccess.WRITE);file.store_string(JSON.stringify(report,"\t"));file.close()
	device.free_rid(pipeline);device.free_rid(set);device.free_rid(buffer);device.free_rid(shader);device.free()
	quit(0 if peak<.03 else 1)

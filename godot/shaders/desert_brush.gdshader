shader_type spatial;
uniform float wind_strength = 1.0;
varying vec3 local_position;
void vertex() {
	local_position = VERTEX;
	// glTF flips Blender V: one at the buried root, lower at the tips.
	float phase = INSTANCE_CUSTOM.x * 6.28318;
	float gust = sin(TIME * 1.3 + phase) * 0.018 + sin(TIME * 2.7 + phase * 1.7) * 0.008;
	float flex = max(0.0, 1.0 - UV.y);
	vec3 wind_local = normalize(transpose(mat3(MODEL_MATRIX)) * vec3(1.0, 0.0, 0.4));
	VERTEX += wind_local * flex * gust * wind_strength;
}
void fragment() {
	float fibres = sin(local_position.x * 133.0 + local_position.z * 197.0 + sin(local_position.y * 9.0) * 0.6);
	float grain = sin(local_position.x * 451.0) * sin(local_position.z * 389.0 + local_position.y * 113.0);
	float detail = 1.0 - smoothstep(0.002, 0.03, length(fwidth(local_position)));
	ALBEDO = COLOR.rgb * (0.93 + detail * (fibres * 0.10 + grain * 0.06));
	ROUGHNESS = 0.96;
}

shader_type spatial;
render_mode cull_disabled;
uniform float wind_strength = 1.0;
void vertex() {
	float pin = smoothstep(0.0, 0.9, UV.y);
	float phase = TIME * 2.3 + MODEL_MATRIX[3].x * 0.37;
	VERTEX.z += pin * wind_strength * (sin(phase + UV.x * 5.0 - UV.y * 3.0) * 0.10 + sin(phase * 1.71 + UV.y * 9.0) * 0.027);
}
void fragment() {
	float thread = sin(UV.x * 580.0) * sin(UV.y * 460.0) * 0.025;
	float worn = sin(UV.x * 21.0 + UV.y * 17.0) * sin(UV.y * 31.0) * 0.055;
	vec3 canvas = vec3(0.31, 0.17, 0.065) + thread + worn;
	float stripe = smoothstep(0.31, 0.33, UV.y) * (1.0 - smoothstep(0.46, 0.49, UV.y));
	ALBEDO = mix(canvas, vec3(0.53,0.44,0.29) + worn, stripe * 0.8);
	ROUGHNESS = 0.96;
}

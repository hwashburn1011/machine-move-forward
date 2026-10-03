shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_disabled;
uniform float wind_strength = 1.0;
instance uniform float phase = 0.0;
void fragment() {
	// Low, discontinuous threads of airborne sand. No animated ground normal,
	// full-screen haze, dynamic lights or particle allocations.
	float t = TIME * (0.14 + wind_strength * 0.025) + phase;
	float edge = smoothstep(0.0, 0.18, UV.x) * smoothstep(0.0, 0.18, 1.0 - UV.x)
		* smoothstep(0.0, 0.28, UV.y) * smoothstep(0.0, 0.28, 1.0 - UV.y);
	float threads = pow(max(0.0, sin(UV.y * 62.0 + sin(UV.x * 13.0 - t) * 1.4)), 6.0);
	float breaks = smoothstep(0.05, 0.72, sin(UV.x * 24.0 - t * 5.0 + UV.y * 7.0));
	float gust = smoothstep(-0.2, 0.8, sin(TIME * 0.41 + phase));
	ALBEDO = vec3(0.48, 0.39, 0.27);
	ROUGHNESS = 1.0;
	ALPHA = edge * threads * breaks * gust * (0.06 + wind_strength * 0.035);
}

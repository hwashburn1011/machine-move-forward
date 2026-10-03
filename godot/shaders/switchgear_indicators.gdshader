shader_type spatial;

uniform vec3 status_bits = vec3(0.0);
varying vec3 channel;

void vertex() {
	// Blender COLOR_0 holds a one-hot channel for each physical lens.
	channel = COLOR.rgb;
}

void fragment() {
	float active = clamp(dot(channel, status_bits), 0.0, 1.0);
	vec3 tint = mix(vec3(0.85, 0.28, 0.035), vec3(0.055, 0.65, 0.38), channel.r);
	ALBEDO = tint * mix(0.065, 0.27, active);
	// The moulded lens stays visible at its rim instead of becoming a flat,
	// clipped disk. Its emissive centre adds no dynamic light to the scene.
	float facing = clamp(dot(normalize(NORMAL), normalize(VIEW)), 0.0, 1.0);
	EMISSION = tint * active * 0.85 * (0.18 + 0.82 * facing * facing * facing);
	ROUGHNESS = 0.28;
	METALLIC = 0.05;
}

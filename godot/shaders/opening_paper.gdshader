shader_type canvas_item;
render_mode unshaded;
uniform float burn=0.0;
uniform float seconds=0.0;
varying vec4 tint;
void vertex(){tint=COLOR;}

float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}

void fragment(){
	vec2 uv=UV;
	float fibre=noise(uv*vec2(790,680));
	float grain=noise(uv*vec2(140,180));
	float cloud=noise(uv*7.0);
	float edge=min(min(uv.x,1.0-uv.x),min(uv.y,1.0-uv.y));
	float torn=.013+.005*noise(uv*82.0)+.0018*noise(uv*310.0);
	float sheet=smoothstep(torn,torn+.0016,edge);
	float age=(1.0-smoothstep(.02,.12,edge))*.18;
	float fold=exp(-abs(uv.x-.496)*240.0)*.045+exp(-abs(uv.y-.506)*290.0)*.032;
	vec3 parchment=vec3(.77,.663,.49)+(cloud-.5)*.065+(grain-.5)*.033+(fibre-.5)*.023-age-fold;
	vec4 ink=texture(TEXTURE,uv);
	vec3 surface=mix(parchment,ink.rgb,ink.a);
	// A ragged front travels up from the lower corner, burning ink with paper.
	float reach=length((uv-vec2(.04,1.02))*vec2(.84,1.0))+.047*noise(uv*22.0)+.018*noise(uv*71.0);
	float front=burn*1.55-.065;
	float remain=smoothstep(front,front+.008,reach);
	float charred=(1.0-smoothstep(.006,.051,reach-front))*step(front,reach)*step(.002,burn);
	surface=mix(surface,vec3(.063,.041,.024),charred*.97);
	float ember=exp(-abs(reach-front-.004)*230.0)*step(.002,burn);
	float tongues=pow(noise(vec2(uv.x*85.0,uv.y*40.0+seconds*5.0)),2.0);
	float flicker=.5+.25*sin(uv.x*188.0+seconds*11.0)+.25*sin(uv.x*317.0-seconds*17.0);
	float flame_distance=abs(reach-front+.011+sin(uv.x*128.0+seconds*9.0)*.007);
	float fire=(1.0-smoothstep(.003,.020+.065*tongues,flame_distance))*step(.002,burn);
	vec3 flame=mix(vec3(.72,.13,.008),vec3(1.0,.62,.16),pow(fire,2.0))*(.82+.18*flicker);
	surface=mix(surface,flame,fire*.91)+vec3(.6,.12,.01)*ember*.35;
	float opacity=sheet*max(remain,fire*.93);
	// Discrete rising cinders are deliberately dim and local to the burnt area.
	vec2 cells=vec2(uv.x*64.0,(uv.y+seconds*.025)*78.0);
	float mote=step(.992,hash(floor(cells)))*(1.0-smoothstep(.015,.11,length(fract(cells)-.5)));
	mote*=step(reach,front)*step(front-.22,reach)*step(.01,burn);
	surface=mix(surface,vec3(.9,.35,.06),mote);opacity=max(opacity,mote*.5);
	COLOR=vec4(surface,opacity)*tint;
}

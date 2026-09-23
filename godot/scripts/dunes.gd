class_name MMFDunes
extends RefCounted

static func hash2(p: Vector2) -> float:
	p=Vector2(fposmod(p.x*123.34,1),fposmod(p.y*345.45,1))
	p+=Vector2.ONE*p.dot(p+Vector2.ONE*34.345)
	return fposmod(p.x*p.y,1)

static func noise(p: Vector2) -> float:
	var i=p.floor()
	var f=p-i
	var u=f*f*f*(f*(f*6-Vector2.ONE*15)+Vector2.ONE*10)
	return lerpf(lerpf(hash2(i),hash2(i+Vector2.RIGHT),u.x),lerpf(hash2(i+Vector2.DOWN),hash2(i+Vector2.ONE),u.x),u.y)*2-1

static func fractal(p: Vector2,octaves: int,ridged: bool=false) -> float:
	var sum_value=0.0
	var amp=1.0
	var total=0.0
	for i in octaves:
		var n=noise(p)
		if ridged: n=pow(1-absf(n),2)
		sum_value+=n*amp
		total+=amp
		amp*=0.5
		p*=2.03
	return sum_value/total

static func height_at(x: float,z: float) -> float:
	var p=Vector2(x,z)/62
	var h=fractal(p,4)*5.2+(fractal(p*2.1+Vector2.ONE*31.7,3,true)-0.5)*2.6
	return lerpf(h*0.08-0.55,h,smoothstep(10,30,absf(x)))

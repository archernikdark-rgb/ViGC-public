import type { SceneShape } from '../workspace/document.ts';
export interface Point {x:number;y:number}
export interface TraceHit {shapeId:string;point:Point;distance:number}
const epsilon=1e-7;
function rotate(p:Point,degrees:number):Point {const a=degrees*Math.PI/180;return {x:p.x*Math.cos(a)-p.y*Math.sin(a),y:p.x*Math.sin(a)+p.y*Math.cos(a)};}
export function anchorPosition(shape:SceneShape,id?:string):Point {
 const anchor=id?shape.anchors?.find(a=>a.id===id):undefined;
 if(id&&!anchor)throw Error('Точка привязки удалена. Выберите другую.');
 const offset=rotate(anchor??{x:0,y:0},shape.rotation??0);return {x:shape.x+offset.x,y:shape.y+offset.y};
}
function local(s:SceneShape,p:Point):Point{return rotate({x:p.x-s.x,y:p.y-s.y},-(s.rotation??0));}
function polygon(s:SceneShape):Point[]{
 if(s.kind==='rectangle')return [{x:-(s.width??160)/2,y:-(s.height??100)/2},{x:(s.width??160)/2,y:-(s.height??100)/2},{x:(s.width??160)/2,y:(s.height??100)/2},{x:-(s.width??160)/2,y:(s.height??100)/2}];
 return Array.from({length:s.sides??5},(_,i)=>{const a=i*2*Math.PI/(s.sides??5)-Math.PI/2;return {x:Math.cos(a)*s.radius,y:Math.sin(a)*s.radius};});
}
export function containsPoint(s:SceneShape,world:Point):boolean {
 const p=local(s,world),r=Math.hypot(p.x,p.y);
 if(s.kind==='point')return r<=7+epsilon;
 if(s.kind==='circle')return r<=s.radius+epsilon;
 if(s.kind==='chart') {if((s.fillPercent??75)===0)return false;const angle=((Math.atan2(p.y,p.x)*180/Math.PI+90)%360+360)%360;return r>= (s.innerRadius??45)-epsilon&&r<=s.radius+epsilon&&(r<epsilon||(s.fillPercent??75)>=100||angle<=(s.fillPercent??75)*3.6+epsilon);}
 if(!['rectangle','polygon'].includes(s.kind))return false;
 const vertices=polygon(s);let inside=false;
 for(let i=0,j=vertices.length-1;i<vertices.length;j=i++) {const a=vertices[i],b=vertices[j];const cross=(p.x-a.x)*(b.y-a.y)-(p.y-a.y)*(b.x-a.x);if(Math.abs(cross)<epsilon&&p.x>=Math.min(a.x,b.x)-epsilon&&p.x<=Math.max(a.x,b.x)+epsilon&&p.y>=Math.min(a.y,b.y)-epsilon&&p.y<=Math.max(a.y,b.y)+epsilon)return true;if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}
 return inside;
}
function cross(a:Point,b:Point){return a.x*b.y-a.y*b.x;}
export function traceShapes(shapes:SceneShape[],from:Point,to:Point):TraceHit[]{
 const length=Math.hypot(to.x-from.x,to.y-from.y);if(!Number.isFinite(length)||length>1e9)throw Error('Дальность проверки должна быть конечной и не больше 1 000 000 000.');
 return shapes.filter(s=>s.collisionEnabled!==false&&['circle','point','rectangle','polygon','chart'].includes(s.kind)).flatMap(s=>{
  const a=local(s,from),b=local(s,to),d={x:b.x-a.x,y:b.y-a.y};const candidates:number[]=[];
  if(containsPoint(s,from))candidates.push(0);
  function edge(p:Point,q:Point){const v={x:q.x-p.x,y:q.y-p.y},delta={x:p.x-a.x,y:p.y-a.y},den=cross(d,v);if(Math.abs(den)<epsilon){if(Math.abs(cross(delta,d))<epsilon){const l=d.x*d.x+d.y*d.y;if(l)for(const e of [p,q])candidates.push(((e.x-a.x)*d.x+(e.y-a.y)*d.y)/l);}return;}const t=cross(delta,v)/den,u=cross(delta,d)/den;if(u>=-epsilon&&u<=1+epsilon)candidates.push(t);}
  function circle(radius:number){const A=d.x*d.x+d.y*d.y;if(!A)return;const B=2*(a.x*d.x+a.y*d.y),C=a.x*a.x+a.y*a.y-radius*radius,disc=B*B-4*A*C;if(disc>=0)for(const t of [(-B-Math.sqrt(disc))/(2*A),(-B+Math.sqrt(disc))/(2*A)])candidates.push(t);}
  if(s.kind==='rectangle'||s.kind==='polygon'){const vs=polygon(s);vs.forEach((v,i)=>edge(v,vs[(i+1)%vs.length]));}
  else {circle(s.kind==='point'?7:s.radius);if(s.kind==='chart'){circle(s.innerRadius??45);for(const angle of [-90,(s.fillPercent??75)*3.6-90]){const r=angle*Math.PI/180;edge({x:Math.cos(r)*(s.innerRadius??45),y:Math.sin(r)*(s.innerRadius??45)},{x:Math.cos(r)*s.radius,y:Math.sin(r)*s.radius});}}}
  const t=candidates.filter(t=>t>=-epsilon&&t<=1+epsilon&&containsPoint(s,{x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t})).sort((a,b)=>a-b)[0];
  return t===undefined?[]:[{shapeId:s.id,distance:Math.max(0,t)*length,point:{x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t}}];
 }).sort((a,b)=>a.distance-b.distance||a.shapeId.localeCompare(b.shapeId));
}

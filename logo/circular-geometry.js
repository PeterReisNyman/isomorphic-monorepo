/* Circle graph generator. No logo templates: sample symmetric point sets,
   enumerate tangent connections, and choose compatible connection orbits. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IsoGeometry=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION=3,R=40,EPS=1e-6,TAU=2*Math.PI;
const f=n=>String(Number(n.toFixed(7)));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const mod=a=>(a%TAU+TAU)%TAU;
const point=(c,r,a)=>[c[0]+r*Math.cos(a),c[1]+r*Math.sin(a)];
const angle=(a,b)=>Math.atan2(b[1]-a[1],b[0]-a[0]);
const reflections={vertical:([x,y])=>[-x,y],horizontal:([x,y])=>[x,-y],diagonal:([x,y])=>[y,x],antidiagonal:([x,y])=>[-y,-x]};
function rng(seed){let a=2166136261;for(const c of String(seed)){a^=c.charCodeAt(0);a=Math.imul(a,16777619);}return()=>{a+=0x6D2B79F5;let t=Math.imul(a^a>>>15,1|a);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}
const pick=(list,random)=>list[Math.floor(random()*list.length)];
function shuffle(list,random){const a=list.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function side(d,F){const h=Math.sqrt((R+F)**2-(d/2)**2);if(!Number.isFinite(h)||h<EPS)throw Error('Impossible circular connection');return{h,x:R*d/(2*(R+F)),y:R*h/(R+F),radius:F};}
function onArc(arc,p,strict=false){const t=mod(angle(arc.center,p)-arc.start);return strict?t>EPS&&t<arc.sweep-EPS:t<arc.sweep+EPS||TAU-t<EPS;}
function arcDistance(arc,p){const t=angle(arc.center,p),nearest=point(arc.center,arc.radius,t);return Math.min(dist(arc.a,p),dist(arc.b,p),onArc(arc,nearest)?Math.abs(dist(arc.center,p)-arc.radius):Infinity);}
function intersections(a,b){const d=dist(a.center,b.center);if(d<EPS||d>a.radius+b.radius+EPS||d<Math.abs(a.radius-b.radius)-EPS)return[];const x=(a.radius*a.radius-b.radius*b.radius+d*d)/(2*d),h=Math.sqrt(Math.max(0,a.radius*a.radius-x*x));const ux=(b.center[0]-a.center[0])/d,uy=(b.center[1]-a.center[1])/d;return [[a.center[0]+ux*x-uy*h,a.center[1]+uy*x+ux*h],[a.center[0]+ux*x+uy*h,a.center[1]+uy*x-ux*h]];}
function geometry(record){
 const paths=[],guides=[],contacts=[],sectors=[],arcs=[];
 const nodes=[...record.nodes,...(record.free||[])];
 const circles=nodes.map((center,i)=>({center,radius:R,kind:record.edges.some(e=>e.a===i||e.b===i)?'connected':'separate'}));
 for(let ei=0;ei<record.edges.length;ei++){
  const e=record.edges[ei],a=nodes[e.a],b=nodes[e.b];if(!a||!b||e.a===e.b)throw Error('Invalid edge');
  const d=dist(a,b),ux=(b[0]-a[0])/d,uy=(b[1]-a[1])/d,p=side(d,e.plus),m=side(d,e.minus);
  if(d<2.08*R)throw Error('Balls too close');
  if(p.h-e.plus+m.h-e.minus<.16*R)throw Error('Neck too thin');
  const world=(x,y)=>[a[0]+ux*x-uy*y,a[1]+uy*x+ux*y],sideGuides=[];
  for(const [s,sign] of [[p,1],[m,-1]]){
   const center=world(d/2,sign*s.h),kind=Math.abs(s.radius-R)<EPS?'equal':'concentric';
   let gi=guides.findIndex(g=>dist(g.center,center)<EPS&&Math.abs(g.radius-s.radius)<EPS);
   if(gi<0){gi=guides.length;guides.push({center,radius:s.radius,kind});}
   sideGuides.push(gi);
   const pa=world(s.x,sign*s.y),pb=world(d-s.x,sign*s.y),from=sign===1?pa:pb,to=sign===1?pb:pa;
   const start=angle(center,from),sweep=mod(angle(center,to)-start);
   if(sweep>Math.PI+EPS)throw Error('Invalid arc sweep');
   arcs.push({center,radius:s.radius,kind,start,sweep,a:from,b:to,edge:ei,nodes:[e.a,e.b],guide:gi});
   contacts.push({ball:a,recess:center,point:pa,radius:s.radius},{ball:b,recess:center,point:pb,radius:s.radius});
  }
  const theta=angle(a,b),ap=Math.acos(d/(2*(R+e.plus))),am=Math.acos(d/(2*(R+e.minus)));
  sectors.push({node:e.a,center:theta,low:am,high:ap,lowGuide:sideGuides[1],highGuide:sideGuides[0]},{node:e.b,center:wrap(theta+Math.PI),low:ap,high:am,lowGuide:sideGuides[0],highGuide:sideGuides[1]});
  paths.push(`<path transform="matrix(${[ux,uy,-uy,ux,...a].map(f).join(' ')})" d="M ${f(p.x)} ${f(p.y)} A ${f(e.plus)} ${f(e.plus)} 0 0 1 ${f(d-p.x)} ${f(p.y)} L ${f(d-m.x)} ${f(-m.y)} A ${f(e.minus)} ${f(e.minus)} 0 0 1 ${f(m.x)} ${f(-m.y)} Z"/>`);
 }
 const rad=(record.rotation||0)*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad),rotate=([x,y])=>[c*x-s*y,s*x+c*y];
 const bounds=items=>{const a=items.map(o=>({center:rotate(o.center),radius:o.radius}));const minX=Math.min(...a.map(o=>o.center[0]-o.radius)),maxX=Math.max(...a.map(o=>o.center[0]+o.radius)),minY=Math.min(...a.map(o=>o.center[1]-o.radius)),maxY=Math.max(...a.map(o=>o.center[1]+o.radius)),size=Math.max(maxX-minX,maxY-minY)+R*1.5;return[(minX+maxX-size)/2,(minY+maxY-size)/2,size,size];};
 const content=paths.join('')+circles.map(o=>`<circle cx="${f(o.center[0])}" cy="${f(o.center[1])}" r="${R}"/>`).join('');
 const outline=guides.map(g=>`<circle class="guide-${g.kind}" cx="${f(g.center[0])}" cy="${f(g.center[1])}" r="${f(g.radius)}"/>`).join('');
 return{content,outline,circles,guides,contacts,sectors,arcs,rotate,view:bounds(circles),constructionView:bounds([...circles,...guides])};
}
function symmetryAxes(record,g=geometry(record)){
 const circleMatch=(p,items)=>items.some(q=>dist(q,p)<EPS);
 const centers=g.circles.map(c=>g.rotate(c.center));
 const arcs=g.arcs.map(a=>({...a,center:g.rotate(a.center),a:g.rotate(a.a),b:g.rotate(a.b)}));
 return Object.entries(reflections).filter(([,reflect])=>centers.every(p=>circleMatch(reflect(p),centers))&&arcs.every(a=>arcs.some(b=>Math.abs(a.radius-b.radius)<EPS&&dist(reflect(a.center),b.center)<EPS&&dist(reflect(a.a),b.b)<EPS&&dist(reflect(a.b),b.a)<EPS))).map(([name])=>name);
}
function components(record){const nodes=[...record.nodes,...(record.free||[])],seen=new Set(),groups=[];for(let i=0;i<nodes.length;i++){if(seen.has(i))continue;const group=[],todo=[i];seen.add(i);while(todo.length){const n=todo.pop();group.push(n);for(const e of record.edges){const v=e.a===n?e.b:e.b===n?e.a:-1;if(v>=0&&!seen.has(v)){seen.add(v);todo.push(v);}}}groups.push(group);}return groups;}
function validate(record,{mirror=true}={}){
 const n=record.nodes.length+(record.free||[]).length;
 if(n<3||n>7||record.balls!==n)throw Error('Ball cap violated');
 if(!record.edges.length)throw Error('No connections');
 const g=geometry(record),edges=new Set();
 for(const e of record.edges){const key=[e.a,e.b].sort((a,b)=>a-b).join(':');if(edges.has(key))throw Error('Duplicate connection');edges.add(key);}
 for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(dist(g.circles[i].center,g.circles[j].center)<2.08*R-EPS)throw Error('Balls overlap or touch');
 // Validate the exposed arc, not the unused completion of its guide circle.
 // This permits an independent central ball in the seven-ball reference.
 for(const a of g.arcs){
  if(a.radius<R-EPS)throw Error('Recess smaller than a ball');
  if(a.kind==='concentric'){
   const support=g.circles.findIndex(c=>dist(c.center,a.center)<EPS);
   if(support<0||a.radius<R*1.12||record.edges.some(e=>e.a===support||e.b===support))throw Error('Larger recess needs a separate concentric ball');
  }
  for(let i=0;i<n;i++)if(!a.nodes.includes(i)&&arcDistance(a,g.circles[i].center)<R*1.08-EPS)throw Error('A ball intersects or pinches an exposed recess arc');
 }
 // Two active concave arcs cannot cut across one another. Identical support
 // circles are merged geometrically; meeting arcs then form ONE recess.
 for(let i=0;i<g.arcs.length;i++)for(let j=i+1;j<g.arcs.length;j++){
  const a=g.arcs[i],b=g.arcs[j];if(a.guide===b.guide)continue;
  for(const p of intersections(a,b))if(onArc(a,p)&&onArc(b,p))throw Error('Exposed recess arcs intersect: scalloped gap');
 }
 for(let i=0;i<g.sectors.length;i++)for(let j=i+1;j<g.sectors.length;j++){
  const a=g.sectors[i],b=g.sectors[j];if(a.node!==b.node)continue;const delta=wrap(b.center-a.center);
  for(const turn of [-TAU,0,TAU])if(Math.min(a.high,delta+turn+b.high)-Math.max(-a.low,delta+turn-b.low)>EPS)throw Error('Connections overlap outside their shared ball');
 }
 // A tiny remnant of a ball must not disguise two recesses as one scallop.
 // Consecutive joins either share exactly one circular recess or leave a
 // clearly exposed convex arc (at least 60 degrees) between their recesses.
 for(let i=0;i<n;i++){
  const sectors=g.sectors.filter(s=>s.node===i).map(s=>({...s,start:mod(s.center-s.low),width:s.low+s.high})).sort((a,b)=>a.start-b.start);
  if(sectors.length<2)continue;
  for(let j=0;j<sectors.length;j++){const a=sectors[j],b=sectors[(j+1)%sectors.length],gap=b.start+(j===sectors.length-1?TAU:0)-a.start-a.width;if(gap<Math.PI/3-EPS&&a.highGuide!==b.lowGuide)throw Error('Adjacent recesses form a scallop instead of one circular gap');}
 }
 for(let i=0;i<n;i++)if(g.sectors.filter(s=>s.node===i).reduce((sum,s)=>sum+s.low+s.high,0)>Math.PI+EPS)throw Error('A ball loses its outer semicircle');
 for(const t of g.contacts){const v=[t.point[0]-t.ball[0],t.point[1]-t.ball[1]],w=[t.recess[0]-t.ball[0],t.recess[1]-t.ball[1]];if(Math.abs(Math.hypot(...v)-R)>EPS||Math.abs(dist(t.point,t.recess)-t.radius)>EPS||Math.abs(v[0]*w[1]-v[1]*w[0])>EPS)throw Error('Non-tangent contact');}
 const axes=mirror?symmetryAxes(record,g):[];if(mirror&&!axes.length)throw Error('Missing mirror symmetry');
 if(mirror&&record.axes&&record.axes.some(a=>!axes.includes(a)))throw Error('Incorrect declared symmetry');
 const groups=components(record);
 return{balls:n,contacts:g.contacts.length,axes,components:groups.map(c=>c.length).sort((a,b)=>b-a),isolated:groups.filter(c=>c.length===1).length,equalRecesses:g.guides.filter(c=>c.kind==='equal').length,concentricRecesses:g.guides.filter(c=>c.kind==='concentric').length,activeArcsChecked:true};
}

// A small reflected lattice is only a source of candidate ball centres.
// Selecting subsets and independent edge orbits creates the topology.
// Pitch and horizontal phase vary independently; no point list describes a logo.
const cloudCache=new Map();
function clouds(pitch,phase,count){
 const key=[pitch,phase,count].join(':');if(cloudCache.has(key))return cloudCache.get(key);
 const orbits=[];for(let row=-1;row<=1;row++)orbits.push([[0,row*pitch]]);
 for(let col=0;col<2;col++){const x=(phase||pitch)+col*pitch;for(let row=-1;row<=1;row++)orbits.push([[-x,row*pitch],[x,row*pitch]]);}
 const out=[];
 for(let mask=1;mask<(1<<orbits.length);mask++){
  const nodes=orbits.flatMap((o,i)=>mask&(1<<i)?o:[]);if(nodes.length!==count)continue;
  if(nodes.some((a,i)=>nodes.some((b,j)=>j>i&&dist(a,b)<2.08*R-EPS)))continue;
  // Keep one spatial cluster; its drawn connections can be disconnected.
  const seen=new Set([0]);let changed=true;while(changed){changed=false;for(let i=0;i<nodes.length;i++)if(!seen.has(i)&&[...seen].some(j=>dist(nodes[i],nodes[j])<=3.55*R)){seen.add(i);changed=true;}}
  if(seen.size!==count)continue;
  const xs=nodes.map(p=>p[0]),ys=nodes.map(p=>p[1]),w=Math.max(...xs)-Math.min(...xs)+2*R,h=Math.max(...ys)-Math.min(...ys)+2*R;
  if(Math.max(w,h)>11*R||Math.max(w,h)/Math.min(w,h)>2.4)continue;
  out.push(nodes);
 }
 cloudCache.set(key,out);return out;
}
function edgeOptions(nodes){
 const edges=[];
 for(let a=0;a<nodes.length;a++)for(let b=a+1;b<nodes.length;b++){
  const A=nodes[a],B=nodes[b],d=dist(A,B);if(d<2.08*R||d>4.4*R)continue;
  const choices={1:[],[-1]:[]};
  if(d<4*R-EPS){choices[1].push(R);choices[-1].push(R);}
  for(let i=0;i<nodes.length;i++){
   if(i===a||i===b)continue;const P=nodes[i],D=dist(P,A),F=D-R;if(Math.abs(D-dist(P,B))>EPS||F<R*1.12||F>R*2.2)continue;
   const cross=(B[0]-A[0])*(P[1]-A[1])-(B[1]-A[1])*(P[0]-A[0]);if(Math.abs(cross)<EPS)continue;
   const list=choices[cross>0?1:-1];if(!list.some(v=>Math.abs(v-F)<EPS))list.push(F);
  }
  for(const plus of choices[1])for(const minus of choices[-1]){
   const e={a,b,plus,minus};try{validate({nodes,free:[],edges:[e],balls:nodes.length,rotation:0},{mirror:false});edges.push(e);}catch{}
  }
 }
 return edges;
}
function edgeOrbits(nodes){
 const options=edgeOptions(nodes),mirrors=nodes.map(([x,y])=>nodes.findIndex(p=>dist(p,[-x,y])<EPS)),orbits=[],used=new Set();
 const key=e=>[e.a,e.b,f(e.plus),f(e.minus)].join(':');
 for(const e of options){if(used.has(key(e)))continue;let a=mirrors[e.a],b=mirrors[e.b],plus=e.minus,minus=e.plus;if(a>b){[a,b]=[b,a];[plus,minus]=[minus,plus];}
  const other=options.find(q=>q.a===a&&q.b===b&&Math.abs(q.plus-plus)<EPS&&Math.abs(q.minus-minus)<EPS);if(!other)continue;
  const orbit=key(other)===key(e)?[e]:[e,other];orbit.forEach(q=>used.add(key(q)));orbits.push(orbit);
 }
 return orbits;
}
function candidate(seed,random){
 const count=pick([3,4,4,5,5,6,7,7],random);
 const gap=pick([.25,1/3,.5,.75],random);
 const pitch=pick([2*R,2*R,2*R,(2+gap)*R/Math.SQRT2,2.25*R],random);
 const phase=pick([0,0,1.25*R,1.5*R,1.75*R],random);
 const pool=clouds(pitch,phase,count);if(!pool.length)return null;
 const nodes=pick(pool,random).map(p=>p.slice()),orbits=shuffle(edgeOrbits(nodes),random);
 const record={version:VERSION,seed:String(seed),family:'circle-graph',nodes,free:[],edges:[],balls:count,rotation:pick([0,45,90,135],random),lattice:{pitch,phase}};
 const density=.4+random()*.6;
 for(const orbit of orbits){if(record.edges.length&&random()>density)continue;const trial={...record,edges:record.edges.concat(orbit)};try{validate(trial);record.edges=trial.edges;}catch{}}
 if(!record.edges.length)return null;
 // Prevent a cloud of unrelated dots: at most three components, and each
 // isolated ball must face a real recess or lie near the connected group.
 const groups=components(record);if(groups.length>3)return null;
 const isolated=groups.filter(g=>g.length===1).map(g=>g[0]),g=geometry(record);
 if(isolated.some(i=>!g.guides.some(c=>dist(c.center,nodes[i])<EPS)&&!g.arcs.some(a=>arcDistance(a,nodes[i])<2.7*R)))return null;
 record.axes=symmetryAxes(record,g);return record;
}
function generate(seed){const random=rng(seed);for(let attempt=0;attempt<800;attempt++){const record=candidate(seed,random);if(!record)continue;try{validate(record);return record;}catch{}}throw Error('No valid circle graph for this seed');}
function fingerprint(r){const g=geometry(r),cx=g.circles.reduce((s,c)=>s+c.center[0],0)/r.balls,cy=g.circles.reduce((s,c)=>s+c.center[1],0)/r.balls;const pk=p=>[f(p[0]-cx),f(p[1]-cy)].join(',');return JSON.stringify([g.circles.map(c=>pk(c.center)).sort(),g.arcs.map(a=>[pk(a.center),f(a.radius),[pk(a.a),pk(a.b)].sort().join(';')].join(':')).sort()]);}
function batch(seed,count=128,existing=[]){if(!Number.isInteger(count)||count<1||count>2000)throw Error('Count must be 1–2000');const seen=new Set(existing.map(fingerprint)),records=[];for(let attempt=0;records.length<count&&attempt<count*100;attempt++){const r=generate(`${seed}:${attempt}`),k=fingerprint(r);if(seen.has(k))continue;seen.add(k);r.id=String(existing.length+records.length+1).padStart(3,'0');records.push(r);}if(records.length<count)throw Error('Not enough distinct circle graphs; choose another seed');return records;}
function svg(record,{construction=false,color='#000000'}={}){const g=geometry(record),view=construction?g.constructionView:g.view;return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view.map(f).join(' ')}" width="640" height="640" role="img" aria-label="Isomorphic ${esc(record.id||record.seed)}"><title>Isomorphic ${esc(record.id||record.seed)}</title><desc>${record.balls} equal balls; ${(record.axes||symmetryAxes(record)).join(', ')} symmetry. Exact tangent circular arcs. Seed ${esc(record.seed)}.</desc>${construction?'<style>.guide-equal{stroke:#d46724}.guide-concentric{stroke:#008d84}</style>':''}<g transform="rotate(${record.rotation||0})"><g fill="${esc(color)}">${g.content}</g>${construction?`<g fill="none" stroke-width="1.25" stroke-dasharray="5 4">${g.outline}</g>`:''}</g></svg>`;}
return{VERSION,R,rng,generate,batch,geometry,svg,validate,fingerprint,symmetryAxes,components,clouds,edgeOrbits};
});

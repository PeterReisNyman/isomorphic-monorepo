const fs=require('node:fs'),path=require('node:path');
const data=require('./animation.json');
const root=path.resolve(__dirname,'site');
fs.mkdirSync(root,{recursive:true});
const stages=data.stages.map(({name,balls,svg})=>({name,balls,svg}));
const html=fs.readFileSync(path.join(__dirname,'player.html'),'utf8').replace('__STAGES__',JSON.stringify(stages)).replace('__TIMING__',JSON.stringify({hold:data.hold,move:data.move,cycle:data.cycle,duration:data.cycle*stages.length}));
fs.writeFileSync(path.join(root,'animation.html'),html);
fs.cpSync(path.join(__dirname,'assets'),path.join(root,'animation-assets'),{recursive:true});
console.log(`Published ${root}/animation.html`);

const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cards=stages.map((s,i)=>`<article>${s.svg}<h2>${i+1} · ${escape(s.name)}</h2><p>${s.balls} balls</p></article>`).join('');
fs.writeFileSync(path.join(root,'selection.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isomorphic favorites</title><style>body{font:16px system-ui;max-width:1100px;margin:40px auto;padding:0 24px;color:#151815}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}article{border:1px solid #ddd;border-radius:16px;padding:20px}svg{width:100%;height:220px}h2{font-size:18px}a{color:inherit}p{color:#777}</style><h1>Your 11 favorites</h1><p><a href="animation.html">Play animation ↗</a></p><section>${cards}</section></html>`);

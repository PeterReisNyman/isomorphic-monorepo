// Snapshot the approved favorites; all resting silhouettes come from the
// existing exact circular-arc geometry, with a single common ball radius.
const fs = require('node:fs');
const path = require('node:path');
const G = require('./circular-geometry.js');
const source = require('./favorites.json');
const out = path.join(__dirname, 'assets');
fs.mkdirSync(out, { recursive: true });
const stages = source.choices.map((choice, index) => {
  const r = { ...choice.record, rotation: choice.rotation };
  const validation = G.validate(r);
  const g = G.geometry(r);
  const rotated = g.circles.map(c => g.rotate(c.center));
  const mid = [0, 1].map(axis => (Math.min(...rotated.map(p => p[axis])) + Math.max(...rotated.map(p => p[axis]))) / 2);
  const position = p => { const q = g.rotate(p); return [q[0] - mid[0] + 256, q[1] - mid[1] + 256]; };
  const polygons = r.edges.map((e, i) => g.arcs.slice(i * 2, i * 2 + 2).flatMap(a => {
    const steps = Math.ceil(a.sweep * a.radius / .16);
    return Array.from({ length: steps + 1 }, (_, j) => {
      const angle = a.start + a.sweep * j / steps;
      return position([a.center[0] + a.radius * Math.cos(angle), a.center[1] + a.radius * Math.sin(angle)]);
    });
  }));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1080" height="1080"><g transform="translate(${256-mid[0]} ${256-mid[1]}) rotate(${r.rotation})" fill="black">${g.content}</g></svg>`;
  fs.writeFileSync(path.join(out, `stage-${index + 1}.svg`), svg);
  return { index, id: choice.id, label: choice.label, name: choice.name, balls: r.balls,
    circles: g.circles.map(c => position(c.center)), radius: G.R, polygons, svg, validation,
    links: r.edges.map(e => {
      const a=r.nodes[e.a], b=r.nodes[e.b], d=Math.hypot(a[0]-b[0],a[1]-b[1]);
      const halfNeck=(Math.sqrt((G.R+e.plus)**2-(d/2)**2)-e.plus + Math.sqrt((G.R+e.minus)**2-(d/2)**2)-e.minus)/2;
      return { a:e.a,b:e.b,softness:4*(Math.hypot(d/2,halfNeck)-G.R),
        plus:Math.sqrt((G.R+e.plus)**2-(d/2)**2)-e.plus,
        minus:Math.sqrt((G.R+e.minus)**2-(d/2)**2)-e.minus };
    }) };
});
const data = { title: 'Isomorphic — one structure, many forms', fps: 60, size: 1080,
  hold: 2, move: 2.4, cycle: 4.4, revision: 6, stages };
fs.writeFileSync(path.join(__dirname, 'animation.json'), JSON.stringify(data));
console.log(`Prepared ${stages.length} exact stages; ${stages.length*data.cycle}s loop.`);

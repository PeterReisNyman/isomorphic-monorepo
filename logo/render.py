"""Short spline choreography through the approved Isomorphic marks.

Only intentional joining pairs enter a contact neighbourhood.
Unrelated circles and necks remain separated. One shared eased clock follows
all paths, with a two-second still hold at every exact favorite silhouette.
"""
from pathlib import Path
import argparse, itertools, json, math, subprocess
import numpy as np
from PIL import Image, ImageDraw
from choreography import ArcSpline, plan_spline, KNOTS, LEAVE, JOIN

ROOT = Path(__file__).resolve().parent
DATA = json.loads((ROOT / 'animation.json').read_text())
ASSETS = ROOT / 'assets'
STAGES = DATA['stages']

def ease(t):
    t = np.clip(t, 0, 1)
    return t*t*t*(t*(t*6-15)+10)

def matching(source, target):
    """Find short circle paths while keeping as many bridges as possible."""
    a,b = np.asarray(source['circles']),np.asarray(target['circles'])
    reverse = len(a)<len(b)
    large,small = (target,source) if reverse else (source,target)
    if reverse: a,b=b,a
    variants = [tuple(range(len(b)))] if len(a)==len(b) else [tuple(range(len(b)))+(i,) for i in range(len(b))]
    maps = np.array(sorted(set(p for v in variants for p in itertools.permutations(v))),dtype=np.int32)
    ends = b[maps]
    cost = np.sum((ends-a)**2,axis=(1,2))
    velocity = ends-a
    for i in range(len(a)):
        for j in range(i):
            start = a[i]-a[j]
            delta = velocity[:,i]-velocity[:,j]
            u = np.clip(-np.sum(delta*start,axis=1)/np.maximum(np.sum(delta*delta,axis=1),1e-8),0,1)
            nearest = np.linalg.norm(start+u[:,None]*delta,axis=1)
            cost += np.where(maps[:,i]==maps[:,j],0,np.maximum(0,84-nearest)**2*35)
    small_edges = {tuple(sorted((e['a'],e['b']))) for e in small['links']}
    shared = np.zeros(len(maps))
    for edge in large['links']:
        ma,mb = maps[:,edge['a']],maps[:,edge['b']]
        for x,y in small_edges:
            shared += ((ma==x)&(mb==y))|((ma==y)&(mb==x))
    cost += (len(large['links'])-shared)*7000
    cost[shared<1]=np.inf
    best=maps[np.argmin(cost)]
    start_ids,end_ids=np.arange(len(a)),best
    if reverse: start_ids,end_ids=end_ids,start_ids
    starts=np.array(source['circles'],np.float32)[start_ids]
    ends=np.array(target['circles'],np.float32)[end_ids]

    def project(stage, ids, other_ids, other_stage, preferred=None):
        other_edges={tuple(sorted((e['a'],e['b']))) for e in other_stage['links']}
        mapped={}
        for edge in stage['links']:
            options=[(int(i),int(j)) for i in np.where(ids==edge['a'])[0] for j in np.where(ids==edge['b'])[0]]
            def score(pair):
                i,j=pair
                key=tuple(sorted(pair))
                common=key in (preferred or {}) or tuple(sorted((other_ids[i],other_ids[j]))) in other_edges
                distance=np.linalg.norm((starts[i]+ends[i])-(starts[j]+ends[j]))
                return (not common,distance)
            i,j=min(options,key=score)
            plus,minus=edge['plus'],edge['minus']
            if i>j: i,j,plus,minus=j,i,minus,plus
            mapped[(i,j)]={'plus':plus,'minus':minus,
                          'distance':float(np.linalg.norm(np.asarray(stage['circles'][edge['a']])-stage['circles'][edge['b']]))}
        return mapped

    old=project(source,start_ids,end_ids,target)
    new=project(target,end_ids,start_ids,source,old)
    common=old.keys() & new.keys()
    if not common: raise ValueError(f"No persistent bridge: {source['name']} → {target['name']}")
    return {'starts':starts,'ends':ends,'old':old,'new':new,'common':len(common)}

class Renderer:
    def __init__(self,size):
        self.size,self.scale=size,size/512
        q=(np.arange(size,dtype=np.float32)+.5)/self.scale
        self.x,self.y=q[None,:],q[:,None]
        self.images=[]
        for stage in STAGES:
            big=Image.new('L',(size*3,size*3),0)
            draw,scale=ImageDraw.Draw(big),self.scale*3
            for poly in stage['polygons']:
                draw.polygon([(round(x*scale),round(y*scale)) for x,y in poly],fill=255)
            for x,y in stage['circles']:
                draw.ellipse(tuple(round(v*scale) for v in (x-40,y-40,x+40,y+40)),fill=255)
            self.images.append(255-np.asarray(big.resize((size,size),Image.Resampling.LANCZOS)))
        cache_path=ROOT/'route-cache-v5.json'
        cached=json.loads(cache_path.read_text()) if cache_path.exists() else []
        self.maps=[]
        for i in range(len(STAGES)):
            m=matching(STAGES[i],STAGES[(i+1)%len(STAGES)])
            if i<len(cached) and cached[i].get('short') and np.allclose(m['starts'],cached[i]['starts']) and np.allclose(m['ends'],cached[i]['ends']):
                c=cached[i]
                m.update(control=np.array(c['control']),spline=ArcSpline(c['control']),
                         retiring={tuple(k) for k in c['retiring']},joining={tuple(k) for k in c['joining']},
                         leave_at=LEAVE,join_at=JOIN)
            else:
                if i<len(cached):m['seedControl']=cached[i]['control']
                m=plan_spline(m,i)
                item={key:m[key].tolist() for key in ['starts','ends','control']} | {key:[list(k) for k in m[key]] for key in ['retiring','joining']} | {'short':True}
                if i<len(cached):cached[i]=item
                else:cached.append(item)
                cache_path.write_text(json.dumps(cached))
            self.maps.append(m)

    def bounds(self,points,margin):
        lo=np.maximum(0,np.floor((np.min(points,axis=0)-margin)*self.scale)).astype(int)
        hi=np.minimum(self.size,np.ceil((np.max(points,axis=0)+margin)*self.scale)).astype(int)
        return slice(lo[1],hi[1]),slice(lo[0],hi[0])

    def circle_field(self,centers,smoothing=0):
        field=np.full((self.size,self.size),1e4,dtype=np.float32)
        for cx,cy in centers:
            sy,sx=self.bounds([[cx,cy]],42+smoothing)
            d=np.sqrt((self.x[:,sx]-cx)**2+(self.y[sy,:]-cy)**2)-40
            part=field[sy,sx]
            if smoothing>.001:
                h=np.maximum(smoothing-np.abs(part-d),0)/smoothing
                field[sy,sx]=np.minimum(part,d)-h*h*smoothing*.25
            else: np.minimum(part,d,out=part)
        return field

    def contact_rounding(self,field,centers,mapping,u):
        # Smooth only explicitly related balls. Applying a smooth union to
        # all circles would make unrelated neighbours attract one another.
        allowed=set(mapping['old']) | set(mapping['new'])
        for i in range(len(centers)):
            for j in range(i):
                if np.linalg.norm(mapping['starts'][i]-mapping['starts'][j])<1 or np.linalg.norm(mapping['ends'][i]-mapping['ends'][j])<1:
                    allowed.add((j,i))
        strength=6*math.sin(math.pi*u)**2
        if strength<.001:return
        for i,j in allowed:
            a,b=centers[i],centers[j]
            if np.linalg.norm(a-b)>84:continue
            sy,sx=self.bounds([a,b],44)
            da=np.hypot(self.x[:,sx]-a[0],self.y[sy,:]-a[1])-40
            db=np.hypot(self.x[:,sx]-b[0],self.y[sy,:]-b[1])-40
            h=np.maximum(strength-np.abs(da-db),0)/strength
            contact=np.minimum(da,db)-h*h*strength*.25
            np.minimum(field[sy,sx],contact,out=field[sy,sx])

    @staticmethod
    def fillets(d,plus,minus):
        return [max(.001,(d*d/4-1600+w*w)/(2*(40-w))) for w in [plus,minus]]

    def bridge(self,field,a,b,plus,minus,smoothing=0,retraction=0):
        d=float(np.linalg.norm(b-a))
        if d<=80.001 or retraction>=1: return
        fp,fm=self.fillets(d,plus,minus)
        hp,hm=(math.sqrt(max(0,(40+f)**2-d*d/4)) for f in [fp,fm])
        xp,xm=(40*d/(2*(40+f)) for f in [fp,fm])
        yp,ym=40*hp/(40+fp),40*hm/(40+fm)
        if yp+ym<.00001: return
        sy,sx=self.bounds([a,b],42)
        ux,uy=(b-a)/d
        dx,dy=self.x[:,sx]-a[0],self.y[sy,:]-a[1]
        x,y=dx*ux+dy*uy,-dx*uy+dy*ux
        slope=(xp-xm)/(yp+ym)
        intercept=xm+slope*ym
        normal=math.sqrt(1+slope*slope)
        # Exact contact quadrilateral minus the two supporting recess circles.
        bridge=np.maximum(y-yp,-y-ym)
        np.maximum(bridge,(intercept+slope*y-x)/normal,out=bridge)
        np.maximum(bridge,(x+slope*y+intercept-d)/normal,out=bridge)
        upper=fp-np.sqrt((x-d/2)**2+(y-hp)**2)
        lower=fm-np.sqrt((x-d/2)**2+(y+hm)**2)
        cutouts=np.maximum(upper,lower)
        if retraction>0:
            # Morph geometry, never opacity. Rounding the two recess fields
            # gives the separating ends rounded tips instead of pointed stubs.
            q=float(retraction)
            rounding=40*math.sin(math.pi*min(q,.5))**2
            h=np.maximum(rounding-np.abs(upper-lower),0)/max(rounding,1e-8)
            rounded_cutouts=cutouts+h*h*rounding*.25
            original=np.maximum(bridge,cutouts)
            rounded=np.maximum(bridge,rounded_cutouts)
            circles=np.minimum(np.hypot(x,y),np.hypot(x-d,y))-40
            shrinking=(1-q)*rounded+q*circles
            # The circular contact is tangent, so this field blend keeps
            # the attachment smooth while the end recedes into the ball.
            shape=np.minimum(circles,shrinking)
            # Retraction may only remove material from the original bridge.
            # This also preserves the existing clearance to every other ball.
            np.maximum(shape,np.minimum(circles,original),out=shape)
            # Restore distance units near the new contour so anti-aliasing
            # stays a thin edge, even near the moment the neck pinches apart.
            gy,gx=np.gradient(shape)
            shape/=np.maximum(.05,np.hypot(gx,gy)*self.scale)
            np.minimum(field[sy,sx],shape,out=field[sy,sx])
            return
        np.maximum(bridge,cutouts,out=bridge)
        part=field[sy,sx]
        if smoothing>.001:
            k=smoothing*.55
            h=np.maximum(k-np.abs(part-bridge),0)/k
            field[sy,sx]=np.minimum(part,bridge)-h*h*k*.25
        else: np.minimum(part,bridge,out=part)

    def flowing_field(self,index,u):
        mapping=self.maps[index]
        centers=mapping['spline'](u).astype(np.float32)
        # Shared arc distance controls playback; topology follows the actual
        # geometric contact locations on the curves.
        u=float(mapping['spline'].parameter(u))
        # Small smooth unions round overlapping balls at a contact. At the
        # resting keyframes this is exactly zero.
        smoothing=8*math.sin(math.pi*u)**2
        field=self.circle_field(centers)
        self.contact_rounding(field,centers,mapping,u)
        for key in mapping['old'].keys()|mapping['new'].keys():
            old,new=mapping['old'].get(key),mapping['new'].get(key)
            if old and new:
                plus=old['plus']*(1-u)+new['plus']*u
                minus=old['minus']*(1-u)+new['minus']*u
                reference=old['distance']*(1-u)+new['distance']*u
            elif old:
                if key in mapping['retiring'] and u>=mapping['leave_at']: continue
                plus,minus,reference=old['plus'],old['minus'],old['distance']
            else:
                if key in mapping['joining'] and u<mapping['join_at']: continue
                plus,minus,reference=new['plus'],new['minus'],new['distance']
            d=float(np.linalg.norm(centers[key[0]]-centers[key[1]]))
            if d<=80.001: continue
            # Connections shrink entirely inside the balls before switching.
            # As the joined balls separate, their tangent neck grows smoothly.
            stretch=max(0,(d-80)/max(1,reference-80))
            plus=min(34,plus*stretch)
            minus=min(34,minus*stretch)
            retraction=float(ease(u/mapping['leave_at'])) if key in mapping['retiring'] else 0
            self.bridge(field,centers[key[0]],centers[key[1]],plus,minus,smoothing,retraction=retraction)
        return field

    def frame(self,seconds):
        seconds%=len(STAGES)*DATA['cycle']
        i=int(seconds/DATA['cycle'])
        local=seconds-i*DATA['cycle']
        if local<DATA['hold']: return self.images[i]
        # Cubic spline velocity and acceleration are continuous across both
        # joining events. No stop or direction kink is inserted at a waypoint.
        u=float(ease((local-DATA['hold'])/DATA['move']))
        field=self.flowing_field(i,u)
        pixels=np.clip(field*self.scale+.5,0,1)
        return np.uint8(pixels*255)

    def review(self):
        cell=240
        times=[.1]+[DATA['hold']+DATA['move']*t for t in [.15,.3,.5,.7,.85,.999]]
        sheet=Image.new('RGB',(cell*len(times),(cell+28)*len(STAGES)),'#f5f5f3')
        draw=ImageDraw.Draw(sheet)
        for i,stage in enumerate(STAGES):
            for col,t in enumerate(times):
                image=Image.fromarray(self.frame(i*DATA['cycle']+t)).resize((cell,cell),Image.Resampling.LANCZOS).convert('RGB')
                sheet.paste(image,(col*cell,i*(cell+28)))
                draw.text((col*cell+8,i*(cell+28)+cell+7),f'{i+1:02} / {t:.2f}s',fill='#333333')
        sheet.save(ROOT/'transition-review-v6.jpg',quality=94)
        for i,image in enumerate(self.images): Image.fromarray(image).save(ASSETS/f'stage-{i+1}.png')
        Image.fromarray(self.images[0]).save(ASSETS/'poster.png')
        report=[{'from':STAGES[i]['name'],'to':STAGES[(i+1)%len(STAGES)]['name'],
                 'starts':m['starts'].tolist(),'ends':m['ends'].tolist(),
                 'persistentBridges':m['common'], 'splineControlPoints':m['control'].tolist(), 'pathSamples':m['spline'](np.linspace(0,1,401)).round(5).transpose(1,0,2).tolist(), 'pathData':m['spline'].svg_paths(), 'pathProgress':m['spline'].path_progress(np.linspace(0,1,401)).round(7).T.tolist(), 'releasingWithoutContact':[list(k) for k in m['retiring']], 'joiningAtContact':[list(k) for k in m['joining']]} for i,m in enumerate(self.maps)]
        (ROOT/'motion-map.json').write_text(json.dumps(report,indent=2))
        (ASSETS/'motion-paths.json').write_text(json.dumps(report,separators=(',',':')))
        print('Persistent bridges per transition:',[m['common'] for m in self.maps],flush=True)

    def movie(self,fps):
        target=ASSETS/'isomorphic-motion.mp4'
        frames=round(len(STAGES)*DATA['cycle']*fps)
        cmd=['ffmpeg','-y','-hide_banner','-loglevel','error','-f','rawvideo','-pix_fmt','gray','-s',f'{self.size}x{self.size}','-r',str(fps),'-i','-',
             '-an','-c:v','libx264','-preset','medium','-crf','14','-pix_fmt','yuv420p','-movflags','+faststart',str(target)]
        process=subprocess.Popen(cmd,stdin=subprocess.PIPE)
        for f in range(frames):
            process.stdin.write(self.frame(f/fps).tobytes())
            if f%round(fps*DATA['cycle'])==0: print(f'Stage {int(f/(fps*DATA["cycle"]))+1}/{len(STAGES)} rendered',flush=True)
        process.stdin.close()
        if process.wait(): raise RuntimeError('ffmpeg failed')
        self.review()
        print(f'Created {target} ({self.size}×{self.size}, {fps}fps, {frames/fps:g}s)',flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--preview',action='store_true')
    parser.add_argument('--size',type=int,default=1080)
    parser.add_argument('--fps',type=int,default=60)
    args=parser.parse_args()
    renderer=Renderer(args.size)
    if args.preview: renderer.review()
    else: renderer.movie(args.fps)

"""Short collision-constrained cubic routes with a shared distance clock."""
import itertools, json
from pathlib import Path
import numpy as np
from scipy.interpolate import CubicSpline
from scipy.optimize import minimize

KNOTS = np.array([0, .16, .32, .5, .66, .83, 1.])
LEAVE, JOIN = .20, .66
RADIUS = 40.


class ArcSpline:
    """Use one arc-length clock for the whole moving configuration.

    Contacts are geometric constraints, not deadlines for each ball to make
    extra distance. A ball can remain nearly stationary while others travel.
    """
    def __init__(self, control, resolution=8001):
        self.control = np.asarray(control)
        self.curve = CubicSpline(KNOTS, control, axis=0, bc_type='natural')
        self.ts = np.linspace(0, 1, resolution)
        dense = self.curve(self.ts)
        distances = np.linalg.norm(np.diff(dense, axis=0), axis=2)
        self.cumulative = np.vstack([np.zeros((1, len(control[0]))), np.cumsum(distances, axis=0)])
        self.lengths = self.cumulative[-1]
        # Euclidean distance in configuration space makes the total motion
        # steady without forcing equal individual progress or decorative loops.
        self.shared = np.r_[0, np.cumsum(np.linalg.norm(np.diff(dense, axis=0).reshape(resolution-1,-1),axis=1))]

    def parameter(self, progress):
        return np.interp(progress*self.shared[-1], self.shared, self.ts)

    def __call__(self, progress):
        return self.curve(self.parameter(np.asarray(progress)))

    def path_progress(self, progress):
        t=self.parameter(np.asarray(progress))
        return np.stack([np.interp(t,self.ts,self.cumulative[:,i])/max(length,1e-8)
                         for i,length in enumerate(self.lengths)],axis=-1)

    def svg_paths(self):
        """Exact cubic Bezier commands for the on-screen spline guides."""
        paths=[]
        for ball in range(len(self.lengths)):
            start=self.curve(0)[ball]
            commands=[f'M{start[0]:.5f},{start[1]:.5f}']
            for left,right in zip(KNOTS[:-1],KNOTS[1:]):
                span=right-left
                p0,p3=self.curve(left)[ball],self.curve(right)[ball]
                p1=p0+self.curve(left,1)[ball]*span/3
                p2=p3-self.curve(right,1)[ball]*span/3
                commands.append('C'+','.join(f'{v:.5f}' for point in [p1,p2,p3] for v in point))
            paths.append(' '.join(commands))
        return paths


def minimum_distances(mapping, progress, pairs):
    """Only intentional topology changes have a zero surface gap.

    Elsewhere balls keep at least an 11-unit gap. Shared source/destination
    circles are explicit birth/merge events, rather than accidental collisions.
    """
    progress = np.atleast_1d(progress)
    a, b = mapping['starts'], mapping['ends']
    limits = np.full((len(progress), len(pairs)), 92.)
    for k, (i, j) in enumerate(pairs):
        da, db = np.linalg.norm(a[i]-a[j]), np.linalg.norm(b[i]-b[j])
        limits[:, k] = min(92, da if da > 1 else 92, db if db > 1 else 92)
        if (i, j) in mapping['joining']:
            limits[:, k] = np.minimum(limits[:, k], 80 + 12 * np.minimum(1, ((progress-JOIN)/.13)**2))
        if da < 1:
            q = np.minimum(1, progress/.25)
            limits[:, k] = np.minimum(limits[:, k], 92 * q*q*(3-2*q))
        if db < 1:
            q = np.minimum(1, (1-progress)/.25)
            limits[:, k] = np.minimum(limits[:, k], 92 * q*q*(3-2*q))
    return limits


def bridge_clearances(mapping, progress, positions, padding=7):
    """Keep foreign balls outside the *actual circular fillets*, too."""
    margins=[]
    old,new=mapping['old'],mapping['new']
    for key in sorted(old.keys() | new.keys()):
        i,j=key
        e0,e1=old.get(key),new.get(key)
        active=np.ones(len(progress),dtype=bool)
        if e0 and e1:
            plus=e0['plus']*(1-progress)+e1['plus']*progress
            minus=e0['minus']*(1-progress)+e1['minus']*progress
            ref=e0['distance']*(1-progress)+e1['distance']*progress
        else:
            e=e0 or e1
            plus,minus,ref=e['plus'],e['minus'],e['distance']
            if key in mapping['retiring']: active &= progress<LEAVE
            if key in mapping['joining']: active &= progress>=JOIN
        a,b=positions[:,i],positions[:,j]
        delta=b-a
        distance=np.linalg.norm(delta,axis=1)
        active &= distance>80.01
        d=np.maximum(distance,80.01)
        stretch=np.maximum(0,(d-80)/np.maximum(1,ref-80))
        wp,wm=np.minimum(34,plus*stretch),np.minimum(34,minus*stretch)
        fp=np.maximum(.001,(d*d/4-1600+wp*wp)/(2*(40-wp)))
        fm=np.maximum(.001,(d*d/4-1600+wm*wm)/(2*(40-wm)))
        hp=np.sqrt(np.maximum(0,(40+fp)**2-d*d/4))
        hm=np.sqrt(np.maximum(0,(40+fm)**2-d*d/4))
        xp,xm=40*d/(2*(40+fp)),40*d/(2*(40+fm))
        yp,ym=40*hp/(40+fp),40*hm/(40+fm)
        slope=(xp-xm)/np.maximum(1e-6,yp+ym)
        intercept=xm+slope*ym
        ux,uy=delta[:,0]/d,delta[:,1]/d
        for k in range(positions.shape[1]):
            if k in key: continue
            dx,dy=(positions[:,k]-a).T
            x,y=dx*ux+dy*uy,-dx*uy+dy*ux
            field=np.maximum.reduce([y-yp,-y-ym,
                (intercept+slope*y-x)/np.hypot(1,slope),
                (x+slope*y+intercept-d)/np.hypot(1,slope),
                fp-np.hypot(x-d/2,y-hp),fm-np.hypot(x-d/2,y+hm)])
            required=40.5+padding*np.sin(np.pi*progress)**2
            # Duplicate tracks represent one ball splitting or merging.
            if any(np.linalg.norm(mapping['starts'][k]-mapping['starts'][end])<1 for end in key):
                required=required*np.minimum(1,progress/.25)
            if any(np.linalg.norm(mapping['ends'][k]-mapping['ends'][end])<1 for end in key):
                required=required*np.minimum(1,(1-progress)/.25)
            margins.append(np.where(active,field-required,100))
    return np.array(margins).T


def plan_spline(mapping, index=0):
    """Minimize travel and bending while preserving the geometric rules.

    Existing necks release without contact. New connections pass through a
    tangent contact. A shared arc clock follows the optimized configuration,
    allowing a nearly stationary ball to travel only as far as it needs to.
    """
    a,b=mapping['starts'].astype(float),mapping['ends'].astype(float)
    mapping['retiring']={k for k in mapping['old'].keys()-mapping['new'].keys() if np.linalg.norm(b[k[0]]-b[k[1]])>1}
    mapping['joining']={k for k in mapping['new'].keys()-mapping['old'].keys() if np.linalg.norm(a[k[0]]-a[k[1]])>1}
    pairs=np.array(list(itertools.combinations(range(len(a)),2)))
    events=[(JOIN,k) for k in sorted(mapping['joining'])]
    sample_t=np.unique(np.r_[np.linspace(0,1,81),LEAVE,JOIN,JOIN-.002,JOIN+.002])[1:-1]
    energy_t=np.linspace(0,1,61)
    def control(flat):
        return np.concatenate([a[None],flat.reshape(-1,len(a),2)*100,b[None]])
    def curve(flat):
        return CubicSpline(KNOTS,control(flat),axis=0,bc_type='natural')
    def objective(flat):
        c=curve(flat)
        distance=np.linalg.norm(c(energy_t,1),axis=-1).mean(axis=0).sum()
        bending=np.square(c(energy_t,2)).mean(axis=0).sum()
        return (distance+.0006*bending)/100
    def clearance(flat):
        c=curve(flat);positions=c(sample_t)
        distances=np.linalg.norm(positions[:,pairs[:,0]]-positions[:,pairs[:,1]],axis=-1)
        return np.r_[(distances-minimum_distances(mapping,sample_t,pairs)+.15).ravel(),
                     bridge_clearances(mapping,sample_t,positions,padding=5).ravel(),
                     (positions-47).ravel(),(465-positions).ravel()]/100
    def contacts(flat):
        c=curve(flat)
        return np.array([np.linalg.norm(c(t)[i]-c(t)[j])-80.02 for t,(i,j) in events])/100
    baseline=a[None]*(1-KNOTS[:,None,None])+b[None]*KNOTS[:,None,None]
    initial=np.asarray(mapping.get('seedControl',baseline))[1:-1].ravel()/100
    for attempt in range(4):
        constraints=[{'type':'ineq','fun':clearance}]
        if events:constraints.append({'type':'eq','fun':contacts})
        result=minimize(objective,initial,method='SLSQP',bounds=[(.47,4.65)]*len(initial),
                        constraints=constraints,options={'maxiter':200,'ftol':1e-7})
        c=curve(result.x);dense_t=np.linspace(0,1,4001);positions=c(dense_t)
        distances=np.linalg.norm(positions[:,pairs[:,0]]-positions[:,pairs[:,1]],axis=-1)
        margins=distances-minimum_distances(mapping,dense_t,pairs)
        bridges=bridge_clearances(mapping,dense_t,positions,padding=1.8)
        error=float(np.max(np.abs(contacts(result.x)),initial=0)*100)
        route=ArcSpline(control(result.x))
        bad=dense_t[np.any(margins<-.3,axis=1)|np.any(bridges<-.05,axis=1)]
        print(f'Route {index+1}, pass {attempt+1}: travel {route.lengths.sum():.1f}, spacing {margins.min():.3f}, bridge {bridges.min():.3f}, contact {error:.4f}',flush=True)
        if not len(bad) and error<.2:
            mapping.update(spline=route,control=control(result.x),leave_at=LEAVE,join_at=JOIN,route_lengths=route.lengths)
            return mapping
        sample_t=np.unique(np.r_[sample_t,bad[::max(1,len(bad)//50)]])
        initial=result.x
    raise ValueError(f'Could not find a valid short route for transition {index+1}')

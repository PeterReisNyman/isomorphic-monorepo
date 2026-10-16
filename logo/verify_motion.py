"""Verify spacing, contact events, short travel, and two-second holds."""
import itertools, json
import numpy as np
from choreography import ArcSpline, minimum_distances, bridge_clearances
from render import ROOT, STAGES, DATA, Renderer, matching

cache=json.loads((ROOT/'route-cache-v5.json').read_text())
assert len(cache)==len(STAGES)==11
progress=np.linspace(0,1,4001)
report=[]
for index,c in enumerate(cache):
    m=matching(STAGES[index],STAGES[(index+1)%len(STAGES)])
    m.update({key:set(map(tuple,c[key])) for key in ['retiring','joining']})
    route=ArcSpline(c['control'])
    p=route(progress)
    geometric=route.parameter(progress)
    pairs=np.array(list(itertools.combinations(range(p.shape[1]),2)))
    distance=np.linalg.norm(p[:,pairs[:,0]]-p[:,pairs[:,1]],axis=-1)
    residual=distance-minimum_distances(m,geometric,pairs)
    assert residual.min()>-1.05,(index,'circle separation',residual.min())
    bridges=bridge_clearances(m,geometric,p,padding=1.8)
    assert bridges.min()>-.15,(index,'foreign ball and bridge',bridges.min())
    unrelated=[]
    for k,(i,j) in enumerate(pairs):
        if (i,j) in m['old'] or (i,j) in m['new']:continue
        if np.linalg.norm(m['starts'][i]-m['starts'][j])<1 or np.linalg.norm(m['ends'][i]-m['ends'][j])<1:continue
        unrelated.append(distance[:,k].min()-80)
    assert min(unrelated)>10,(index,'unrelated balls touched',min(unrelated))
    # Releasing a neck never requires the balls to touch. The only
    # exception is a pair that is also explicitly merging into one endpoint.
    release_gaps=[]
    for i,j in m['retiring']:
        k=np.where((pairs[:,0]==i)&(pairs[:,1]==j))[0][0]
        gap=distance[:,k].min()-80
        assert gap>10,(index,'balls touched to disconnect',gap)
        release_gaps.append(float(gap))
    contact_errors=[]
    for name,t in [('joining',.66)]:
        for i,j in m[name]:
            q=route.curve(t)
            contact_errors.append(abs(np.linalg.norm(q[i]-q[j])-80))
    assert max(contact_errors,default=0)<2.5,(index,contact_errors)
    # The whole configuration moves at a steady arc-distance rate. Each
    # ball may travel less, or wait, rather than tracing loops to fill time.
    steps=np.linalg.norm(np.diff(p,axis=0).reshape(len(progress)-1,-1),axis=1)
    variation=float(steps.std()/steps.mean())
    assert variation<.01,(index,'uneven shared pacing',variation)
    # Cubics share position, velocity and acceleration at internal knots.
    from choreography import KNOTS
    for knot in KNOTS[1:-1]:
        assert np.max(np.abs(route.curve(knot-1e-8,1)-route.curve(knot+1e-8,1)))<.002
        assert np.max(np.abs(route.curve(knot-1e-8,2)-route.curve(knot+1e-8,2)))<.02
    previous=json.loads((ROOT/'route-cache-v4.json').read_text())[index]
    old_length=ArcSpline(previous['control']).lengths.sum()
    assert route.lengths.sum()<old_length,(index,'no shortening')
    assert np.max(np.abs(p[0]-m['starts']))<1e-6
    assert np.max(np.abs(p[-1]-m['ends']))<1e-6
    report.append({'transition':index+1,'minimumUnrelatedSurfaceGap':float(min(unrelated)),
                   'minimumBridgeClearanceResidual':float(bridges.min()),
                   'minimumDisconnectingGap':min(release_gaps,default=None),
                   'maximumContactError':float(max(contact_errors,default=0)),
                   'sharedArcSpeedVariation':variation,
                   'previousLength':float(old_length),'newLength':float(route.lengths.sum()),
                   'travelReduction':float(1-route.lengths.sum()/old_length),
                   'pathLengths':route.lengths.tolist()})
renderer=Renderer(192)
assert DATA['hold']==2
for i in range(len(STAGES)):
    reference=renderer.frame(i*DATA['cycle']+.05)
    for hold_time in [.5,1,1.5,1.95]:
        assert np.array_equal(reference,renderer.frame(i*DATA['cycle']+hold_time)),(i,'hold moves')
summary={'revision':DATA['revision'],'trajectory':'length-minimized cubic splines with a shared configuration arc-length clock',
         'sharedClock':'quintic acceleration and deceleration','holdSeconds':2,
         'duration':round(DATA['cycle']*len(STAGES),3),'samplesPerTransition':len(progress),
         'transitions':report}
(ROOT/'spline-clearance-verification.json').write_text(json.dumps(summary,indent=2))
print(json.dumps({'verifiedTransitions':len(report),'sampledPoses':len(progress)*len(report),
                  'minimumUnrelatedGap':min(r['minimumUnrelatedSurfaceGap'] for r in report),
                  'totalTravelReduction':1-sum(r['newLength'] for r in report)/sum(r['previousLength'] for r in report),
                  'maximumSharedArcSpeedVariation':max(r['sharedArcSpeedVariation'] for r in report),
                  'holdSeconds':2,'duration':summary['duration']},indent=2))

"""Check solid geometric retraction on every released bridge."""
import json
import numpy as np
from scipy.ndimage import label, binary_dilation
from render import Renderer, ROOT, DATA, ease
from choreography import LEAVE

renderer=Renderer(384)
report=[]
for stage,mapping in enumerate(renderer.maps):
    for edge in sorted(mapping['retiring']):
        a,b=mapping['starts'][list(edge)].astype(float)
        props=mapping['old'][edge]
        circles=renderer.circle_field([a,b])
        original=circles.copy()
        renderer.bridge(original,a,b,props['plus'],props['minus'])
        original_mask=original<0
        previous=original_mask
        areas=[]
        for q in np.linspace(0,1,81):
            field=circles.copy()
            renderer.bridge(field,a,b,props['plus'],props['minus'],retraction=float(q))
            mask=field<0
            assert not np.any(mask & ~original_mask),(stage,edge,q,'grew outside original bridge')
            assert np.all(mask[circles<0]),(stage,edge,q,'changed ball radius')
            components=label(mask)[1]
            assert components in (1,2),(stage,edge,q,'floating fragment',components)
            area=int(np.count_nonzero(mask & ~(circles<0)))
            areas.append(area)
            # Anti-aliasing may move a one-pixel boundary as rounded tips settle.
            assert not np.any(mask & ~binary_dilation(previous,iterations=1)),(stage,edge,q,'regrowth')
            previous=mask
        assert areas[-1]==0,(stage,edge,'not fully retracted')
        assert all(b<=a+2 for a,b in zip(areas,areas[1:])),(stage,edge,'area increased',areas)
        report.append({'stage':stage+1,'edge':list(edge),'initialNeckPixels':areas[0],'finalNeckPixels':areas[-1]})
# Actual frames must be black inside the shape; intermediate grays are only AA.
worst=0
for stage,mapping in enumerate(renderer.maps):
    if not mapping['retiring']:continue
    for geometric in np.linspace(.001,LEAVE-.001,24):
        arc=np.interp(geometric,mapping['spline'].ts,mapping['spline'].shared)/mapping['spline'].shared[-1]
        field=renderer.flowing_field(stage,arc)
        pixels=np.uint8(np.clip(field*renderer.scale+.5,0,1)*255)
        gray=(pixels>2)&(pixels<253)
        # A two-pixel allowance covers the narrow AA zone at the pinch instant.
        boundaries=binary_dilation(pixels<128,iterations=2)&binary_dilation(pixels>=128,iterations=2)
        # Check the changing neck specifically; existing contact anti-aliasing
        # elsewhere in the scene is independent of this release operation.
        old=mapping['old']
        mapping['old']={key:value for key,value in old.items() if key not in mapping['retiring']}
        baseline=renderer.flowing_field(stage,arc)
        mapping['old']=old
        baseline_pixels=np.uint8(np.clip(baseline*renderer.scale+.5,0,1)*255)
        added=pixels<baseline_pixels
        interior_gray=int(np.count_nonzero(gray&~boundaries&added))
        worst=max(worst,interior_gray)
        assert interior_gray==0,(stage,geometric,'translucent interior',interior_gray)
result={'revision':DATA['revision'],'releasedBridges':len(report),'samplesPerBridge':81,
        'maximumInteriorGrayPixels':worst,'bridges':report}
(ROOT/'retraction-verification.json').write_text(json.dumps(result,indent=2))
print(json.dumps({'releasedBridges':len(report),'testedGeometries':len(report)*81,'maximumInteriorGrayPixels':worst,'status':'passed'}))

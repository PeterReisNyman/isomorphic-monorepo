"""Rebuild selected short routes; pass zero-based transition indices."""
import json,sys
from pathlib import Path
from choreography import plan_spline
from render import matching,STAGES
ROOT=Path(__file__).parent

def refine(index,seed=None):
    mapping=matching(STAGES[index],STAGES[(index+1)%len(STAGES)])
    if seed is not None:mapping['seedControl']=seed
    mapping=plan_spline(mapping,index)
    item={key:mapping[key].tolist() for key in ['starts','ends','control']}
    item.update({key:list(map(list,mapping[key])) for key in ['retiring','joining']})
    item['short']=True
    (ROOT/f'direct-route-{index+1}.json').write_text(json.dumps(item))
    return item

if __name__=='__main__':
    cache=json.loads((ROOT/'route-cache-v5.json').read_text())
    for index in map(int,sys.argv[1:]):
        cache[index]=refine(index,cache[index]['control'])
    (ROOT/'route-cache-v5.json').write_text(json.dumps(cache))

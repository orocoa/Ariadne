"""Repeatable synthetic before/after benchmark. Never calls a provider."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import statistics
import subprocess
import sys
import time

def baseline_module(root, revision, path):
    namespace = {}
    code = subprocess.check_output(['git', 'show', f'{revision}:{path}'], cwd=root, text=True)
    exec(compile(code, f'baseline:{path}', 'exec'), namespace)
    return namespace


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2], help='Repository containing the source and public synthetic PDF fixture')
    parser.add_argument('--baseline', default='a16e004cfcb85b430cb808c7b78b1f992f795302')
    parser.add_argument('--output', type=Path, help='New JSON file; default: work/benchmarks/runtime/<timestamp>.json')
    args=parser.parse_args()
    root=args.root.resolve()
    output=args.output or root/'work'/'benchmarks'/'runtime'/f"results-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}.json"
    if output.exists(): parser.error("Output already exists; use a new filename to retain earlier evidence")
    sys.path.insert(0, str(root))
    from src.conversation_events import Preview, SINK, encode
    from src.codex_app_server import PublicEvents
    from src.pdf_delivery import inspect_complete_pdf, render_complete_pdf_pages
    baseline=subprocess.check_output(['git','rev-parse',args.baseline],cwd=root,text=True).strip()
    old_events=baseline_module(root,baseline,'src/conversation_events.py')
    old_codex=baseline_module(root,baseline,'src/codex_app_server.py')
    old_pdf=baseline_module(root,baseline,'src/pdf_delivery.py')
    results={'baseline':baseline,'python':sys.version.split()[0],'provider_calls':0,'private_data_used':False,'preview':[],'commentary':[],'pdf':[]}
    modules=['src/conversation_events.py','src/codex_app_server.py','src/pdf_delivery.py']
    results['module_sha256']={
        'before':{name:hashlib.sha256(subprocess.check_output(['git','show',f'{baseline}:{name}'],cwd=root)).hexdigest() for name in modules},
        'after':{name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in modules},
    }
    for size in (6000,24000,48000):
        raw=json.dumps({'message':'文'*2000,'changes':[{'target':'job.requirements','value':'x'*(size-2100)}]},ensure_ascii=False)
        entry={'characters':len(raw),'delta_characters':20}
        for name,constructor in [('before',old_events['Preview']),('after',Preview)]:
            durations=[]
            for _ in range(3):
                preview=constructor(); start=time.perf_counter()
                for i in range(0,len(raw),20):
                    if name=='before': preview.update(raw[:i+20])
                    else: preview.append(raw[i:i+20])
                durations.append(time.perf_counter()-start)
            entry[name+'_seconds']=statistics.median(durations)
        results['preview'].append(entry)
    for n,step in ((2400,1),(6000,5)):
        entry={'characters':n,'delta_characters':step}
        for name,constructor in [('before',old_codex['PublicEvents']),('after',PublicEvents)]:
            counts={'events':0,'bytes':0}
            def sink(event):
                counts['events']+=1
                counts['bytes']+=len(encode({**event,'seq':counts['events']}))
            token=SINK.set(sink)
            try:
                events=constructor('thread','turn',False,8)
                events.accept({'method':'item/started','params':{'threadId':'thread','turnId':'turn','item':{'type':'agentMessage','id':'message','phase':'commentary'}}})
                for i in range(0,n,step):
                    events.accept({'method':'item/agentMessage/delta','params':{'threadId':'thread','turnId':'turn','itemId':'message','delta':'文'*min(step,n-i)}})
            finally: SINK.reset(token)
            entry[name]=counts
        results['commentary'].append(entry)
    raw=(root/'public/provider-visual-check.pdf').read_bytes()
    results['pdf_fixture_sha256']=hashlib.sha256(raw).hexdigest()
    for name in ('before','after'):
        durations=[]
        for _ in range(3):
            start=time.perf_counter()
            if name=='before':
                count=len(old_pdf['render_complete_pdf_pages'](raw)); pages=old_pdf['render_complete_pdf_pages'](raw)
            else:
                count=inspect_complete_pdf(raw,max_pages=48); pages=render_complete_pdf_pages(raw,max_pages=48)
            assert count==len(pages)==2
            durations.append(time.perf_counter()-start)
        results['pdf'].append({'mode':name,'samples_seconds':durations,'median_seconds':statistics.median(durations),'full_renders':2 if name=='before' else 1,'pages_delivered':len(pages)})
    output.parent.mkdir(parents=True,exist_ok=True)
    with output.open('x') as file: file.write(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(results,ensure_ascii=False,indent=2))

if __name__=='__main__': main()

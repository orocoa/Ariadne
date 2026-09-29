"""A Job PDF must deliver every visual page, with original-byte identity."""
import base64,contextlib,copy,hashlib,io,json,os,runpy,sys
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from src.job_model_runtime import *
from src.runtime_binding import CODEX_MODEL,CODEX_PROTOCOL,CODEX_CREDENTIAL,adapter_for
with contextlib.redirect_stdout(io.StringIO()):fixture=runpy.run_path(str(ROOT/'tests/job_model_import_regression.py'))

def pdf_request(blob=(ROOT/'public/provider-visual-check.pdf').read_bytes(),provider='codex'):
    value=copy.deepcopy(fixture['request']());source=value.pop('source_document');prep=value.pop('source_preparation');h='sha256:'+hashlib.sha256(blob).hexdigest();sid='source-job-'+h[7:]
    source.update(source_document_id=sid,content_hash=h,source_type='PDF',mime_type='application/pdf',filename='synthetic-job.pdf')
    blocks=[{'source_ref':f'job-source-block-{n}','location':f'p. {n}','text':f'Original PDF visual page {n}'} for n in [1,2]]
    prep.update(source_document_id=sid,content_hash=h,source_type='PDF',mime_type='application/pdf',extraction_method='complete_pdf_page_manifest_v1',blocks=blocks,character_count=sum(len(b['text']) for b in blocks))
    value.update(source_documents=[source],source_preparations=[prep],source_bundle={'contract_id':SOURCE_BUNDLE_CONTRACT,'source_bundle_id':'job-source-bundle-'+h[7:],'source_document_ids':[sid],'source_count':1,'ordering':'USER_SUPPLIED'},source_inputs=[{'source_document_id':sid,'document_data_url':'data:application/pdf;base64,'+base64.b64encode(blob).decode()}])
    snapshot=value['runtime_snapshot']
    if provider=='codex':snapshot.update(provider=provider,model=CODEX_MODEL,protocol=CODEX_PROTOCOL,credential_ref=CODEX_CREDENTIAL,adapter_version=adapter_for(provider,snapshot['adapter_version']))
    from src.model_settings import envelope
    snapshot['execution_settings'] = envelope(snapshot['provider'], snapshot['model'])
    identity=value['source_bundle']['source_bundle_id'];consent=value['consent'];consent.update(source_document_id=identity,provider=snapshot['provider'],model=snapshot['model'])
    fp=runtime_fingerprint(snapshot);op=job_model_operation_id(identity,fp,consent['consent_id']);value['operation_identity'].update(source_document_id=identity,runtime_fingerprint=fp,operation_id=op);value['processing_run_id']='run-'+op
    return value

with patch.dict(os.environ,{'ARIADNE_CODEX_ENABLED':'1'}):
    for provider in ['codex','deepseek']:
        request=pdf_request(provider=provider);validated=validate_job_model_request(request)
        with patch('src.job_model_runtime.render_complete_pdf_pages',return_value=[('1',b'image-one'),('2',b'image-two')]):
            payload=build_job_model_payload(validated);parts=payload['messages'][1]['content'];images=[p for p in parts if p['type']=='image_url']
            assert len(images)==2 and images[1]['image_url']['url'].endswith(base64.b64encode(b'image-two').decode())
            assert 'PDF page 1, source_ref job-source-block-1' in json.dumps(parts) and 'PDF page 2, source_ref job-source-block-2' in json.dumps(parts)
        calls=[]
        with patch('src.job_model_runtime.render_complete_pdf_pages',return_value=[('1',b'image-one')]):
            try:execute_job_model_request(request,lambda:'synthetic-key',lambda *args:calls.append(args))
            except JobModelRuntimeError as e:assert e.code=='job_pdf_complete_page_manifest_mismatch'
            else:raise AssertionError('partial PDF accepted')
        assert calls==[]
        bad=copy.deepcopy(request);bad['source_inputs'][0]['document_data_url']='data:application/pdf;base64,'+base64.b64encode(b'%PDF-1.4 changed').decode()
        try:validate_job_model_request(bad)
        except JobModelRuntimeError:pass
        else:raise AssertionError('changed original accepted')
        bad=copy.deepcopy(request);bad['source_inputs']=[]
        try:validate_job_model_request(bad)
        except JobModelRuntimeError:pass
        else:raise AssertionError('text-only PDF accepted')
print(json.dumps({'both_provider_complete_job_pdf_delivery':'pass','missing_changed_partial_pdf_rejected_before_provider':'pass','live_provider_calls':0}))

/** Bundled as strings so source and npm export exactly the same opt-in workflow. */
export const TRAINING_REQUIREMENTS = 'torch==2.8.0\ntransformers==4.57.1\npeft==0.17.0\naccelerate==1.10.1\nsafetensors==0.6.2\n';
export const TRAINING_CONFIG = {schema:1,baseModel:{id:null,revision:null,localPath:null,files:[],license:{identifier:null,accepted:false,reviewer:null}},eligibilityReview:{approved:false,reviewer:null,exportManifestSha256:null},training:{device:'cpu',seed:17,epochs:1,maxLength:1024,learningRate:0.0002,loraRank:8,loraAlpha:16,targetModules:[]}};
export const TRAINING_PY = String.raw`#!/usr/bin/env python3
"""Local reviewed-data LoRA workflow. Default is validation only. Never downloads or uploads."""
import argparse, hashlib, importlib.metadata, json, os, pathlib, re, sys

PINS = {'torch':'2.8.0','transformers':'4.57.1','peft':'0.17.0','accelerate':'1.10.1','safetensors':'0.6.2'}

def require(condition, message):
    if not condition: raise ValueError(message)

def digest(data): return hashlib.sha256(data).hexdigest()

def ordinary(path):
    path = pathlib.Path(path)
    require(path.is_absolute() and not path.is_symlink() and path.is_file(), 'Expected an explicit ordinary file')
    require(path.resolve() == path, 'Symlinked file ancestors are unsupported')
    return path.read_bytes()

def closed(value, fields, name):
    require(isinstance(value, dict) and set(value) == set(fields), name + ' has unsupported or missing fields')

def export_data(root):
    root = pathlib.Path(root).absolute()
    raw = ordinary(root / 'export-manifest.json'); m = json.loads(raw)
    require(m.get('schema') == 1 and m.get('kind') == 'decision-learning-export', 'Unsupported export')
    require(m.get('trainingExecuted') is False and m.get('providerPredictionsIncluded') is False, 'Unsupported source provenance')
    require(set(m['files']) == {'train.jsonl','validation.jsonl','test.jsonl','train-lora.py','requirements-training.txt','training-config.example.json','TRAINING.md'}, 'Unexpected export files')
    for name, ref in m['files'].items():
        closed(ref, ['sha256','bytes'], 'File reference')
        b = ordinary(root / name)
        require(len(b) == ref['bytes'] and digest(b) == ref['sha256'], 'Export file hash/length mismatch: ' + name)
    require(digest(ordinary(pathlib.Path(__file__).absolute())) == m['files']['train-lora.py']['sha256'], 'Run the exact exported training script')
    groups, seen_inputs, seen_cases = {}, {}, set()
    for split in ['train','validation','test']:
        rows = [json.loads(line) for line in ordinary(root / (split+'.jsonl')).decode('utf-8').splitlines()]
        require(len(rows) == m['counts'][split], 'Split count mismatch')
        for row in rows:
            closed(row, ['caseId','caseHash','taskGroup','lineageGroup','sessionId','fixtureOnly','input','question','answer','label','source'], 'Dataset row')
            require(row['caseId'] not in seen_cases and type(row['answer']) is bool, 'Duplicate case or invalid label')
            seen_cases.add(row['caseId'])
            require(row['label']['caseId'] == row['caseId'] and row['label']['caseHash'] == row['caseHash'] and row['label']['value'] == row['answer'] and row['label']['kind'] in ['human','test'] and row['label']['independent'] is True, 'Label identity mismatch')
            for key in ['taskGroup','lineageGroup','sessionId']:
                if row[key] is not None:
                    identity = key + ':' + row[key]
                    require(identity not in groups or groups[identity] == split, 'Related cases cross splits')
                    groups[identity] = split
            normalized = ' '.join(row['input'].casefold().split())
            require(normalized not in seen_inputs or seen_inputs[normalized] == split, 'Duplicate input crosses splits')
            seen_inputs[normalized] = split
            if m.get('trainingEligible') is True: require(row['fixtureOnly'] is False and row['sessionId'] is not None, 'Fixture/anonymous data cannot be training eligible')
    return root, m, digest(raw)

def config_data(path, manifest, manifest_hash):
    c = json.loads(ordinary(pathlib.Path(path).absolute()))
    closed(c, ['schema','baseModel','eligibilityReview','training'], 'Configuration')
    require(c['schema'] == 1, 'Unsupported configuration')
    r = c['eligibilityReview']; closed(r, ['approved','reviewer','exportManifestSha256'], 'Eligibility review')
    require(manifest.get('trainingEligible') is True and manifest.get('mode') == 'reviewed-data', 'Export is not eligible for training; fixtures remain plumbing demonstrations')
    require(r['approved'] is True and isinstance(r['reviewer'], str) and r['reviewer'].strip() and r['exportManifestSha256'] == manifest_hash, 'Exact export eligibility review required')
    b = c['baseModel']; closed(b, ['id','revision','localPath','files','license'], 'Base model')
    require(isinstance(b['id'], str) and b['id'].strip() and isinstance(b['revision'], str) and re.fullmatch(r'[0-9a-f]{40}', b['revision']), 'Select an exact base model and full pinned revision')
    license = b['license']; closed(license, ['identifier','accepted','reviewer'], 'License review')
    require(license['accepted'] is True and all(isinstance(license[k],str) and license[k].strip() for k in ['identifier','reviewer']), 'Explicit model license review required')
    model = pathlib.Path(b['localPath'] or '')
    require(model.is_absolute() and model.is_dir() and model.resolve() == model, 'Base weights must already exist at a canonical local directory')
    require(isinstance(b['files'], list) and b['files'], 'Pinned local model file manifest required')
    expected = {}
    for ref in b['files']:
        closed(ref, ['path','sha256'], 'Model file reference'); name = ref['path']
        require(isinstance(name,str) and name and not pathlib.PurePosixPath(name).is_absolute() and '..' not in pathlib.PurePosixPath(name).parts and '\\' not in name and name not in expected, 'Invalid model relative path')
        require(isinstance(ref['sha256'],str) and re.fullmatch(r'[0-9a-f]{64}',ref['sha256']), 'Invalid model file digest')
        expected[name] = ref['sha256']
        require(digest(ordinary(model / name)) == ref['sha256'], 'Local model hash mismatch')
    actual = set()
    for item in model.rglob('*'):
        require(not item.is_symlink(), 'Model symlinks unsupported')
        if item.is_file(): actual.add(item.relative_to(model).as_posix())
    require(actual == set(expected) and 'config.json' in actual and any(x.endswith('.safetensors') for x in actual), 'Every local model file must be pinned, including config and safe weights')
    t = c['training']; closed(t, ['device','seed','epochs','maxLength','learningRate','loraRank','loraAlpha','targetModules'], 'Training')
    require(t['device'] in ['cpu','cuda'], 'Explicit cpu/cuda device required')
    for name, lo, hi in [('seed',0,2147483647),('epochs',1,10),('maxLength',32,8192),('loraRank',1,64),('loraAlpha',1,128)]:
        require(type(t[name]) is int and lo <= t[name] <= hi, 'Invalid ' + name)
    require(type(t['learningRate']) in [float,int] and 0 < t['learningRate'] <= 0.01, 'Invalid learning rate')
    require(isinstance(t['targetModules'],list) and t['targetModules'] and all(isinstance(x,str) and x for x in t['targetModules']), 'Select target modules for the reviewed base architecture')
    return c

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--export', required=True); p.add_argument('--config'); p.add_argument('--output'); p.add_argument('--check-export-only', action='store_true'); p.add_argument('--train', action='store_true')
    args = p.parse_args()
    require(not (args.train and args.check_export_only), 'Export-only check cannot train')
    root, manifest, manifest_hash = export_data(args.export)
    if args.check_export_only:
        print(json.dumps({'mode':'offline-export-check','exportManifestSha256':manifest_hash,'trainingEligible':manifest['trainingEligible'],'trainingExecuted':False})); return
    require(args.config is not None, 'Supply a reviewed config; the example has no selected model or approval')
    config = config_data(args.config, manifest, manifest_hash)
    versions = {}
    for name in PINS:
        try: versions[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError: versions[name] = None
    receipt = {'mode':'validation-only','exportManifestSha256':manifest_hash,'configSha256':digest(ordinary(pathlib.Path(args.config).absolute())),'python':sys.version,'dependencyVersions':versions,'requiredVersions':PINS,'trainingExecuted':False,'networkAllowed':False}
    if not args.train:
        print(json.dumps(receipt)); return
    require(sys.version_info[:2] == (3,12), 'Training workflow pins Python 3.12; validation itself is standard-library only')
    require(versions == PINS, 'Install and independently verify the exact pinned dependencies before opting into training')
    require(args.output is not None, 'Choose a new local output directory')
    output = pathlib.Path(args.output).absolute(); require(not output.exists(), 'Training output must be new')
    os.environ.update({'HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1','HF_DATASETS_OFFLINE':'1','HF_HUB_DISABLE_TELEMETRY':'1','WANDB_DISABLED':'true'})
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments, set_seed
    from peft import LoraConfig, TaskType, get_peft_model
    t = config['training']; set_seed(t['seed'])
    require(t['device'] != 'cuda' or torch.cuda.is_available(), 'Configured CUDA device unavailable')
    local = config['baseModel']['localPath']
    tokenizer = AutoTokenizer.from_pretrained(local, local_files_only=True, trust_remote_code=False)
    require(tokenizer.eos_token_id is not None, 'Selected tokenizer requires an EOS token')
    if tokenizer.pad_token_id is None: tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(local, local_files_only=True, trust_remote_code=False, use_safetensors=True)
    model = get_peft_model(model, LoraConfig(task_type=TaskType.CAUSAL_LM, r=t['loraRank'], lora_alpha=t['loraAlpha'], target_modules=t['targetModules'], lora_dropout=0.0, bias='none'))
    def rows(split):
        data = []
        for line in ordinary(root / (split + '.jsonl')).decode('utf-8').splitlines():
            row = json.loads(line)
            require(row['fixtureOnly'] is False and type(row['answer']) is bool and row['label']['kind'] in ['human','test'] and row['label']['independent'] is True, 'Only independently labeled reviewed real data may train')
            prompt = 'Question: ' + row['question'] + '\nEvidence:\n' + row['input'] + '\nAnswer (true or false): '
            prefix = tokenizer.encode(prompt, add_special_tokens=True)
            target = tokenizer.encode('true' if row['answer'] else 'false', add_special_tokens=False) + [tokenizer.eos_token_id]
            require(len(prefix) + len(target) <= t['maxLength'], 'Example exceeds reviewed token limit; do not silently truncate evidence')
            data.append({'input_ids':prefix+target,'attention_mask':[1]*(len(prefix)+len(target)),'labels':[-100]*len(prefix)+target})
        require(data, 'Training and validation splits must be nonempty'); return data
    def collate(batch):
        width = max(len(r['input_ids']) for r in batch)
        return {key:torch.tensor([r[key]+[(-100 if key=='labels' else tokenizer.pad_token_id if key=='input_ids' else 0)]*(width-len(r[key])) for r in batch]) for key in ['input_ids','attention_mask','labels']}
    train, validation = rows('train'), rows('validation')
    output.mkdir(mode=0o700)
    receipt['mode']='explicit-local-training'; receipt['trainingExecuted']=True
    receipt['resolvedEnvironment']={d.metadata.get('Name','unknown'):d.version for d in importlib.metadata.distributions()}
    (output/'run-config.json').write_text(json.dumps({'receipt':receipt,'config':config},indent=2)+'\n')
    trainer = Trainer(model=model,args=TrainingArguments(output_dir=str(output/'checkpoints'),use_cpu=t['device']=='cpu',seed=t['seed'],data_seed=t['seed'],num_train_epochs=t['epochs'],learning_rate=t['learningRate'],per_device_train_batch_size=1,per_device_eval_batch_size=1,eval_strategy='epoch',save_strategy='no',report_to=[],push_to_hub=False,dataloader_num_workers=0),train_dataset=train,eval_dataset=validation,data_collator=collate)
    trainer.train(); model.save_pretrained(output/'adapter',safe_serialization=True); tokenizer.save_pretrained(output/'adapter')
    (output/'validation-metrics.json').write_text(json.dumps(trainer.evaluate(),indent=2)+'\n')
    print(json.dumps({'adapter':str(output/'adapter'),'trainingExecuted':True,'heldOutTestUsedForTraining':False,'deploymentAuthorized':False}))

if __name__ == '__main__':
    try: main()
    except (ValueError, OSError, KeyError, TypeError, json.JSONDecodeError) as error:
        print('learning workflow refused: ' + str(error), file=sys.stderr); sys.exit(1)
`;
export const TRAINING_DOC = `# Local LoRA workflow

This export contains independent labels, never JEV predictions. A fixture demonstration is not training eligible. No training or installation has been performed by exporting these files.

1. Check the intact export offline: python3 train-lora.py --export /absolute/export --check-export-only.
2. For reviewed real data only, select a base model, immutable full revision, license and an existing canonical local weight directory. Pin every file by SHA-256 in a separate copy of training-config.example.json. Select architecture-specific LoRA target modules. Record an explicit eligibility review bound to the exact export-manifest.json digest. Storage consent alone is insufficient.
3. Use an isolated Python 3.12 environment with the exact requirements-training.txt versions. Resolve dependencies separately, retain the complete resolved environment/wheel hashes, and assess the host memory requirements. The template pins direct versions; it is not a platform-complete dependency lock or proof of hardware support.
4. Run python3 train-lora.py --export /absolute/export --config /absolute/reviewed-config.json. Default behavior validates only. It reports installed dependency versions and never loads a model.
5. Only after separate approval, add --train --output /absolute/new-adapter-directory. Training requires the pinned environment and already available safe weights. The script disables Hub access, telemetry, remote code and publishing. It refuses occupied output or evidence truncation. Only train/validation examples feed the trainer; the test split is hash-checked but never loaded into the trainer.
6. Evaluate the held-out test split against the unchanged base and deterministic oracle before considering deployment. Validation loss and an adapter file are not proof of decision quality, calibration, speed, generality or runtime authority.

The selected repository/task families and their variants must remain together across splits. Recheck consent, rights and eligibility for any new export. This local script is not an OS sandbox; do not run untrusted model code or packages. A seed records intended reproducibility, not bit-for-bit GPU determinism.

Implementation references: https://huggingface.co/docs/peft/v0.17.0/en/quicktour and https://huggingface.co/docs/transformers/v4.57.1/en/main_classes/trainer . Local-only loading: https://huggingface.co/docs/transformers/v4.57.1/en/installation . This workflow has offline validation tests only; no installed-library training qualification or trained model is claimed.
`;
export function trainingAssets() { return {'train-lora.py':TRAINING_PY,'requirements-training.txt':TRAINING_REQUIREMENTS,'training-config.example.json':JSON.stringify(TRAINING_CONFIG,null,2)+'\n','TRAINING.md':TRAINING_DOC}; }

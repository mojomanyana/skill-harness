import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  isNativeJevModel, nativeModelSha256, validateNativeRoute, makeNativeRequest,
  nativeRequestSha256, normalizeNativeResult, validateNativePrediction,
} from './native-jev.mjs';

const model = {type:'classifier', provider:'typesafe', id:'jev-latest', api:'typesafe-system-one'};
const route = {transport:'pi-classifier', provider:model.provider, model:model.id,
  api:model.api, modelSha256:nativeModelSha256(model)};
const answer = (probability=0.8) => ({api:route.api, provider:route.provider, model:route.model,
  stopReason:'stop', answers:{decision:{type:'bool', probability}}, timestamp:1});

describe('native JEV classifier contract', () => {
  it('selects only JEV classifier routes and hashes equivalent native snapshots consistently', () => {
    expect(isNativeJevModel(model)).toBe(true);
    expect(isNativeJevModel({...model, provider:'cloudflare', id:'@cf/typesafe-ai/jev-1.0', api:'cloudflare-workers-ai-system-one'})).toBe(true);
    expect(isNativeJevModel({...model, provider:'openrouter', id:'~typesafe/jev-latest'})).toBe(true);
    for (const changed of [{type:'chat'}, {provider:'openai'}, {id:'jev-router'}, {id:'arbitrary-classifier'}, {api:'openai-responses'}])
      expect(isNativeJevModel({...model, ...changed})).toBe(false);
    expect(nativeModelSha256({...model, unused:undefined, cost:{input:1,output:2}}))
      .toBe(nativeModelSha256({cost:{output:2,input:1}, api:model.api,id:model.id,provider:model.provider,type:model.type}));
    expect(nativeModelSha256({...model, cost:{input:1}})).not.toBe(nativeModelSha256({...model, cost:{input:2}}));
    expect(validateNativeRoute(route)).toEqual(route);
    expect(() => validateNativeRoute({...route, fallback:'openai'})).toThrow();
  });

  it('constructs the exact native boolean request and binds UTF-8 input without transport claims', () => {
    const example={input:'State with 🍎 and\u2028separator', question:'Is it ready?'};
    const request={state:{input:example.input},questions:{decision:{type:'bool',instructions:example.question,
      criteria:{true:'The answer to the question is yes.',false:'The answer to the question is no.'}}}};
    expect(makeNativeRequest(example)).toEqual(request);
    expect(nativeRequestSha256(example)).toBe(createHash('sha256').update(JSON.stringify(request)).digest('hex'));
    expect(nativeRequestSha256({...example, question:'Is it complete?'})).not.toBe(nativeRequestSha256(example));
    expect(() => makeNativeRequest({...example,input:'broken\ud800'})).toThrow();
  });

  it('preserves valid probabilities, unavailable usage and explicit catalog estimate provenance', () => {
    for (const probability of [0,1]) {
      const result=normalizeNativeResult(route,answer(probability),0);
      expect(result).toMatchObject({status:'answered',probability,resolvedModel:null,returnedProvider:route.provider,
        returnedModel:route.model,usage:{inputTokens:null,outputTokens:null,costUsd:null},costSource:null,error:null});
      expect(validateNativePrediction(route,result)).toBe(true);
    }
    const result=normalizeNativeResult(route,{...answer(),usage:{input:0,output:3,cacheRead:0,cacheWrite:0,totalTokens:3,
      cost:{input:0,output:0.002,cacheRead:0,cacheWrite:0,total:0.002}}},12);
    expect(result).toMatchObject({usage:{inputTokens:0,outputTokens:3,costUsd:0.002},costSource:'pi-catalog-estimate'});
    expect(validateNativePrediction(route,result)).toBe(true);
  });

  it('rejects malformed answers or present usage without leaking provider diagnostics or alternate identities', () => {
    for (const changed of [
      {answers:{decision:{type:'bool',probability:1.1}}},
      {answers:{decision:{type:'choice',probability:0.8}}},
      {usage:{input:-1,output:1}}, {usage:{input:1.5,output:1}},
      {usage:{input:1,output:1,cost:{total:Number.NaN}}}, {usage:null},
    ]) {
      const result=normalizeNativeResult(route,{...answer(),...changed,errorMessage:'credential-do-not-copy'},1);
      expect(result).toMatchObject({status:'error',probability:null,error:'invalid provider response'});
      expect(JSON.stringify(result)).not.toContain('credential-do-not-copy');
      expect(validateNativePrediction(route,result)).toBe(true);
    }
    const wrong=normalizeNativeResult(route,{...answer(),provider:'credential-do-not-copy'},1);
    expect(wrong.returnedProvider).toBe(null);expect(wrong.returnedModel).toBe(null);
    expect(normalizeNativeResult(route,{...answer(),stopReason:'aborted',errorMessage:'private'},1).error).toBe('provider request aborted');
    expect(normalizeNativeResult(route,{...answer(),stopReason:'error',errorMessage:'private'},1).error).toBe('provider request failed');
    expect(validateNativePrediction(route,normalizeNativeResult(route,null,null))).toBe(true);
  });

  it('refuses saved-result laundering of requested identity, catalog cost or malformed metrics', () => {
    const result=normalizeNativeResult(route,answer(),10);
    for (const change of [
      {resolvedModel:'provider-resolved-snapshot'}, {returnedProvider:'other'},
      {costSource:'provider-billed'}, {latencyMs:undefined}, {probability:Infinity},
      {usage:{inputTokens:undefined,outputTokens:null,costUsd:null}}, {unexpected:'field'},
    ]) expect(validateNativePrediction(route,{...result,...change})).toBe(false);
  });
});

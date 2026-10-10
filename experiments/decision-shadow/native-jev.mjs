import { createHash } from 'node:crypto';

const APIS = new Set(['typesafe-system-one', 'cloudflare-workers-ai-system-one']);
const IDENTIFIER = /^[A-Za-z0-9@~][A-Za-z0-9@~._:/-]{0,255}$/;
const JEV = /(?:^|[/:])jev(?:-latest|-[0-9][A-Za-z0-9._-]*)?$/;
const keys = value => Object.keys(value).sort().join(',');
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && IDENTIFIER.test(value);
const sha256 = value => createHash('sha256').update(value).digest('hex');
function check(condition, message) { if (!condition) throw new TypeError(message); }
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(item => item === undefined ? null : canonical(item));
  check(isRecord(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value)), 'Native model snapshot must be JSON data');
  return Object.fromEntries(Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => [key, canonical(value[key])]));
}
function routeIdentity(value) {
  return identifier(value.provider) && value.provider.toLowerCase() !== 'openai' &&
    identifier(value.model) && JEV.test(value.model.toLowerCase()) && APIS.has(value.api);
}
export function isNativeJevModel(model) {
  return isRecord(model) && model.type === 'classifier' &&
    routeIdentity({provider:model.provider, model:model.id, api:model.api});
}
export function nativeModelSha256(model) {
  check(isNativeJevModel(model), 'Select a supported native JEV classifier');
  return sha256(JSON.stringify(canonical(model)));
}
export function validateNativeRoute(route) {
  check(isRecord(route) && keys(route) === 'api,model,modelSha256,provider,transport', 'Invalid native JEV route fields');
  check(route.transport === 'pi-classifier' && routeIdentity(route) &&
    typeof route.modelSha256 === 'string' && /^[a-f0-9]{64}$/.test(route.modelSha256), 'Invalid native JEV route');
  return Object.freeze({...route});
}
function text(value, maximum, name) {
  check(typeof value === 'string' && value.trim().length > 0 && Array.from(value).length <= maximum &&
    !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value), `Invalid native JEV ${name}`);
}
export function makeNativeRequest({input, question}) {
  text(input, 16000, 'input'); text(question, 8192, 'question');
  return {
    state:{input}, questions:{decision:{type:'bool', instructions:question,
      criteria:{true:'The answer to the question is yes.', false:'The answer to the question is no.'}}},
  };
}
/** Binds our exact native classifier context, not provider-transformed wire bytes. */
export function nativeRequestSha256(example) { return sha256(JSON.stringify(makeNativeRequest(example))); }
function metric(value, integer = false) {
  if (value === undefined) return null;
  check(typeof value === 'number' && Number.isFinite(value) && value >= 0 &&
    (!integer || Number.isSafeInteger(value)), 'Invalid native usage');
  return value;
}
function usageOf(value) {
  if (value === undefined) return {inputTokens:null, outputTokens:null, costUsd:null};
  check(isRecord(value), 'Invalid native usage');
  for (const key of ['cacheRead','cacheWrite','totalTokens']) metric(value[key], true);
  if (value.cost !== undefined) {
    check(isRecord(value.cost), 'Invalid native usage');
    for (const key of ['input','output','cacheRead','cacheWrite']) metric(value.cost[key]);
  }
  return {inputTokens:metric(value.input, true), outputTokens:metric(value.output, true), costUsd:metric(value.cost?.total)};
}
/** Pi returns requested model identity and catalog pricing, not a resolved service revision or invoice. */
export function normalizeNativeResult(route, result, latencyMs) {
  route = validateNativeRoute(route);
  const output = {status:'error', probability:null, resolvedModel:null, returnedProvider:null,
    returnedModel:null, usage:{inputTokens:null, outputTokens:null, costUsd:null}, costSource:null,
    latencyMs:typeof latencyMs === 'number' && Number.isFinite(latencyMs) && latencyMs >= 0 ? latencyMs : null,
    error:'invalid provider response'};
  if (!isRecord(result) || output.latencyMs === null || result.provider !== route.provider ||
      result.model !== route.model || result.api !== route.api) return output;
  output.returnedProvider = result.provider; output.returnedModel = result.model;
  if (result.stopReason === 'error' || result.stopReason === 'aborted')
    return {...output, error:result.stopReason === 'aborted' ? 'provider request aborted' : 'provider request failed'};
  try {
    check(result.stopReason === 'stop' && isRecord(result.answers) && keys(result.answers) === 'decision', 'Invalid answer');
    const answer = result.answers.decision;
    check(isRecord(answer) && answer.type === 'bool' && typeof answer.probability === 'number' &&
      Number.isFinite(answer.probability) && answer.probability >= 0 && answer.probability <= 1, 'Invalid answer');
    const usage = usageOf(result.usage);
    return {...output, status:'answered', probability:answer.probability, usage,
      costSource:usage.costUsd === null ? null : 'pi-catalog-estimate', error:null};
  } catch { return output; }
}

/** Validate saved normalized results without relabeling catalog estimates or requested echoes. */
export function validateNativePrediction(route, result) {
  route = validateNativeRoute(route);
  try {
  check(isRecord(result) && keys(result) === 'costSource,error,latencyMs,probability,resolvedModel,returnedModel,returnedProvider,status,usage', 'Invalid native prediction fields');
  check(result.resolvedModel === null &&
    ((result.returnedProvider === null && result.returnedModel === null) ||
     (result.returnedProvider === route.provider && result.returnedModel === route.model)), 'Invalid native prediction identity');
  check(isRecord(result.usage) && keys(result.usage) === 'costUsd,inputTokens,outputTokens', 'Invalid native prediction usage');
  for (const key of ['inputTokens','outputTokens','costUsd'])
    if (result.usage[key] !== null) { check(result.usage[key] !== undefined, 'Missing native usage field'); metric(result.usage[key], key !== 'costUsd'); }
  if (result.latencyMs !== null) { check(result.latencyMs !== undefined, 'Missing native latency'); metric(result.latencyMs); }
  check(result.costSource === (result.usage.costUsd === null ? null : 'pi-catalog-estimate'), 'Invalid native cost provenance');
  if (result.status === 'answered') {
    check(result.error === null && result.returnedProvider === route.provider &&
      result.returnedModel === route.model && result.latencyMs !== null &&
      typeof result.probability === 'number' && Number.isFinite(result.probability) &&
      result.probability >= 0 && result.probability <= 1, 'Invalid native answer');
  } else {
    check(result.status === 'error' && result.probability === null &&
      ['invalid provider response','provider request failed','provider request aborted'].includes(result.error) &&
      Object.values(result.usage).every(value => value === null), 'Invalid native error');
  }
  return true;
  } catch { return false; }
}

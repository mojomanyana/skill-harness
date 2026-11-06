// Offline acceptance fixture. No network, credentials or production connector.
import { createHash } from 'node:crypto';

const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const digest = value => createHash('sha256').update(stable(value)).digest('hex');

export function calendarFixture() {
  const intents = new Map(), events = new Map();
  let version = 0;
  const nextVersion = () => `"fixture-${++version}"`;
  const key = request => `${request.calendarId}/${request.eventId}`;
  const get = request => structuredClone(events.get(key(request)) ?? null);
  function insert(intentId, request, { approvedDigest, loseResponse = false } = {}) {
    const fingerprint = digest(request);
    const prior = intents.get(intentId);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw Error('Intent parameters changed: new approval required');
      return { ...prior.receipt, reused: true };
    }
    if (approvedDigest !== fingerprint) throw Error('Exact current request is not approved');
    if (request.ifMatch !== undefined) throw Error('Insert has no If-Match contract');
    if (!request.calendarId || !request.eventId || !request.start || !request.end) throw Error('Incomplete fixture event');
    const existing = events.get(key(request));
    const receipt = existing ? { state: 'conflict', status: 409 } : loseResponse
      ? { state: 'unknown', next: 'lookup-exact-event' }
      : { state: 'confirmed', status: 200, eventId: request.eventId };
    if (!existing) events.set(key(request), { id: request.eventId, etag: nextVersion(), start: request.start, end: request.end,
      attendees: request.attendees ?? [], privateIntent: intentId, requestDigest: fingerprint });
    intents.set(intentId, { fingerprint, request: structuredClone(request), receipt });
    return { ...receipt, reused: false };
  }
  function reconcile(intentId, observed) {
    const intent = intents.get(intentId);
    if (!intent) throw Error('Unknown intent');
    if (intent.receipt.state !== 'unknown') return { ...intent.receipt };
    if (observed?.id === intent.request.eventId && observed.privateIntent === intentId && observed.requestDigest === intent.fingerprint) {
      intent.receipt = { state: 'confirmed', eventId: observed.id, notificationDelivery: 'unverified' };
    }
    // Missing or mismatching observations do not authorize a retry.
    return { ...intent.receipt };
  }
  function update(request, ifMatch) {
    const event = events.get(key(request));
    if (!event) return { status: 404 };
    if (!ifMatch || event.etag !== ifMatch) return { status: 412 };
    const revised = { ...event, start: request.start, end: request.end, etag: nextVersion() };
    events.set(key(request), revised);
    return { status: 200, event: structuredClone(revised) };
  }
  return { insert, reconcile, update, get, digest, count: () => events.size };
}

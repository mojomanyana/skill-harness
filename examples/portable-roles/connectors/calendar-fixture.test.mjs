import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarFixture } from './calendar-fixture.mjs';

const request = { calendarId: 'synthetic-calendar', eventId: 'abcde0123456789',
  start: '2026-11-10T14:00:00Z', end: '2026-11-10T14:30:00Z', attendees: ['alex@example.invalid'] };

test('a lost insert response requires exact lookup; repeating an intent cannot create another event', () => {
  const f = calendarFixture(), approval = { approvedDigest: f.digest(request), loseResponse: true };
  assert.equal(f.insert('meeting-1', request, approval).state, 'unknown');
  assert.equal(f.insert('meeting-1', request).reused, true);
  assert.equal(f.count(), 1);
  assert.equal(f.reconcile('meeting-1', null).state, 'unknown');
  assert.equal(f.reconcile('meeting-1', { ...f.get(request), requestDigest: 'wrong' }).state, 'unknown');
  assert.deepEqual(f.reconcile('meeting-1', f.get(request)), {
    state: 'confirmed', eventId: request.eventId, notificationDelivery: 'unverified',
  });
});

test('changed parameters and missing approval cannot send; provider identity conflicts are preserved', () => {
  const f = calendarFixture();
  assert.throws(() => f.insert('meeting-1', request), /not approved/);
  f.insert('meeting-1', request, { approvedDigest: f.digest(request) });
  assert.throws(() => f.insert('meeting-1', { ...request, start: '2026-11-11T14:00:00Z' }), /parameters changed/);
  assert.equal(f.insert('meeting-2', request, { approvedDigest: f.digest(request) }).status, 409);
  assert.equal(f.count(), 1);
});

test('conditional modification belongs to update; stale versions do not overwrite an event', () => {
  const f = calendarFixture(), conditionalInsert = { ...request, ifMatch: '"fixture-1"' };
  assert.throws(() => f.insert('meeting-1', conditionalInsert, { approvedDigest: f.digest(conditionalInsert) }), /no If-Match/);
  f.insert('meeting-1', request, { approvedDigest: f.digest(request) });
  const changed = { ...request, start: '2026-11-10T15:00:00Z', end: '2026-11-10T15:30:00Z' };
  assert.equal(f.update(changed, '"wrong"').status, 412);
  assert.equal(f.get(request).start, request.start);
  const first = f.update(changed, '"fixture-1"');
  assert.equal(first.status, 200);
  assert.equal(f.update(request, '"fixture-1"').status, 412);
  const second = f.update(request, first.event.etag);
  assert.equal(second.status, 200);
  const third = f.update(changed, second.event.etag);
  assert.equal(third.status, 200);
  assert.equal(f.update(request, first.event.etag).status, 412);
  assert.equal(f.update(request, second.event.etag).status, 412);
  assert.equal(new Set([first.event.etag, second.event.etag, third.event.etag]).size, 3);
  assert.equal(f.get(request).start, changed.start);
});

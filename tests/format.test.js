import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatDateTime } from '../src/react/lib/format.js';

test('user-facing timestamps use Korean local time including a UTC date boundary', () => {
  assert.equal(formatDateTime('2026-10-11T14:49:17.955Z'), '2026.10.11 23:49');
  assert.equal(formatDateTime('2026-10-11T16:30:00Z'), '2026.10.12 01:30');
  assert.equal(formatDate('2026-10-11T16:30:00Z'), '2026.10.12');
  assert.equal(formatDateTime('2026-10-11'), '2026.10.11');
  assert.equal(formatDateTime(null), '날짜 확인 필요');
  assert.equal(formatDateTime('invalid'), '날짜 확인 필요');
});

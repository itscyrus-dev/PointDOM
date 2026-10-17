import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cancellationMessage } from '../src/shared/task-message.js';

test('cancellation copy distinguishes notification delivery from actual interruption', () => {
  const t = (_zh: string, en: string) => en;
  assert.match(cancellationMessage({ cancelled: true, notification: 'sent' }, t), /request sent/);
  assert.match(
    cancellationMessage({ cancelled: true, notification: 'unconfirmed' }, t),
    /unconfirmed/,
  );
  assert.match(cancellationMessage({ cancelled: true, notification: 'manual' }, t), /Stop ongoing/);
  assert.equal(
    cancellationMessage({ cancelled: true, notification: 'none' }, t),
    'Annotation cancelled.',
  );
  assert.equal(
    cancellationMessage({ cancelled: false, notification: 'none' }, t),
    'Task already ended.',
  );
});

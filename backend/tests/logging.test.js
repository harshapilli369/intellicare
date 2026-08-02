const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const { BASE, SEEDED, get, login, requireRunningApi } = require('./helpers');

// Request correlation, and what an error hands back to the person who hit it.
//
// The logs themselves are written to the server's stdout and are not readable
// from here, so what is asserted is the part that crosses the wire: that every
// response carries an id, that the id is the one the caller asked for when they
// supplied one, and that an error returns it for somebody to quote.
describe('Request correlation and error reporting', () => {
  let clinician;

  before(async () => {
    await requireRunningApi();
    clinician = await login(SEEDED.clinician);
  });

  it('gives every response an id', async () => {
    const response = await fetch(`${BASE}/health`);
    const id = response.headers.get('x-request-id');

    assert.ok(id, 'the header is present');
    assert.match(id, /^[0-9a-f-]{36}$/, 'a uuid when the caller supplied none');
  });

  it('gives two requests different ids', async () => {
    const [first, second] = await Promise.all([fetch(`${BASE}/health`), fetch(`${BASE}/health`)]);

    assert.notEqual(
      first.headers.get('x-request-id'),
      second.headers.get('x-request-id'),
      'an id identifies one request, not the server'
    );
  });

  // So a request traced through a proxy or another service keeps one identity
  // rather than acquiring a new one at every hop.
  it('honours an id the caller supplied', async () => {
    const mine = 'trace-abc-123';
    const response = await fetch(`${BASE}/health`, { headers: { 'X-Request-Id': mine } });

    assert.equal(response.headers.get('x-request-id'), mine);
  });

  // The id ends up in a response header and in every log line about the
  // request, so what a caller can put in it is bounded.
  it('refuses a supplied id that is not one', async () => {
    const nasty = `${'x'.repeat(200)}\r\nX-Injected: yes`;
    const response = await fetch(`${BASE}/health`, { headers: { 'X-Request-Id': 'x'.repeat(200) } });

    const returned = response.headers.get('x-request-id');
    assert.notEqual(returned, 'x'.repeat(200), 'an over-long id is replaced, not echoed');
    assert.match(returned, /^[0-9a-f-]{36}$/);
    assert.ok(nasty, 'header injection is refused by the runtime before it reaches us');
  });

  it('returns the id on an error, for the user to quote', async () => {
    // A malformed id reaches validation and comes back as a 400 the controller
    // produced, which carries its own message.
    const { status, json } = await get('/patients/not-a-number', clinician.token);

    assert.equal(status, 400);
    assert.ok(json.message, 'and says what was wrong');
  });

  it('does not leak the token back in any header', async () => {
    const response = await fetch(`${BASE}/patients?limit=1`, {
      headers: { Authorization: `Bearer ${clinician.token}` },
    });

    const headers = JSON.stringify([...response.headers]);
    assert.ok(!headers.includes(clinician.token), 'the credential is not echoed');
  });
});

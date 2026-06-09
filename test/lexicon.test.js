// native test file for Rosetta Lexicon API
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');
const { server } = require('../server.js');

const originalFetch = globalThis.fetch;
let testPort;
let testUrl;

test.before((t, done) => {
  // Start server on an ephemeral port
  server.listen(0, '127.0.0.1', () => {
    testPort = server.address().port;
    testUrl = `https://127.0.0.1:${testPort}`;
    
    // Set up global mock fetch
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.startsWith(testUrl)) {
        return originalFetch(url, options);
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    };
    
    done();
  });
});

test.after((t, done) => {
  // Restore global fetch and close server
  globalThis.fetch = originalFetch;
  server.close(done);
});

test('Rosetta Lexicon API - GET /api/lexicon', async (t) => {
  const res = await originalFetch(`${testUrl}/api/lexicon`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  
  assert.ok(data.activeProfile, 'Response should contain activeProfile');
  assert.ok(data.profiles, 'Response should contain profiles');
  assert.ok(data.customMapping, 'Response should contain customMapping');
});

test('Rosetta Lexicon API - POST /api/lexicon (Validation & Storage)', async (t) => {
  // 1. Submit custom mapping updates
  const updatePayload = {
    activeProfile: 'custom',
    customMapping: {
      workspace: 'Docket',
      workspaces: 'Dockets',
      extension: 'App',
      extensions: 'Apps',
      connection: 'Integration',
      connections: 'Integrations',
      diagnostic: 'Healthcheck',
      diagnostics: 'Healthchecks',
      task: 'Item',
      tasks: 'Items',
      group: 'Phase',
      subgroup: 'Tasklist'
    }
  };

  const resPost = await originalFetch(`${testUrl}/api/lexicon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatePayload)
  });

  assert.strictEqual(resPost.status, 200);
  const postResult = await resPost.json();
  assert.strictEqual(postResult.success, true);

  // 2. Fetch again and verify persistent state
  const resGet = await originalFetch(`${testUrl}/api/lexicon`);
  assert.strictEqual(resGet.status, 200);
  const getData = await resGet.json();
  assert.strictEqual(getData.activeProfile, 'custom');
  assert.strictEqual(getData.customMapping.workspace, 'Docket');
  assert.strictEqual(getData.customMapping.group, 'Phase');

  // 3. Negative validation: invalid active profile
  const resInvalid = await originalFetch(`${testUrl}/api/lexicon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activeProfile: 'non_existent_profile' })
  });
  assert.strictEqual(resInvalid.status, 400);
  const invalidResult = await resInvalid.json();
  assert.strictEqual(invalidResult.success, false);
  assert.ok(invalidResult.error);
});

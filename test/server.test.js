// Disable TLS rejection for local testing with self-signed certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert');
const { classifyModelCapabilities, server, recordDiagnostic, recordLedgerEvent, DIAGNOSTICS_FILE, LEDGER_FILE } = require('../server.js');

const originalFetch = globalThis.fetch;
let testPort;
let testUrl;

test.before((t, done) => {
  // Start server on an ephemeral port
  server.listen(0, '127.0.0.1', () => {
    testPort = server.address().port;
    testUrl = `https://127.0.0.1:${testPort}`;
    
    // Set up global mock fetch to intercept Ollama communication
    globalThis.fetch = async (url, options) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/tags')) {
        return {
          status: 200,
          statusText: 'OK',
          ok: true,
          json: async () => ({
            models: [
              { name: 'gemma4:12b-it-qat' },
              { name: 'llama3:8b' },
              { name: 'llava:latest' },
              { name: 'mxbai-embed-large' }
            ]
          })
        };
      }
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

test('Model Capabilities Classification', (t) => {
  // Gemma 4
  const gemma4Caps = classifyModelCapabilities('gemma4:12b-it-qat');
  assert.ok(gemma4Caps.includes('chat'), 'gemma4 should have chat capability');
  assert.ok(gemma4Caps.includes('tools'), 'gemma4 should have tools capability');

  // Llama 3
  const llama3Caps = classifyModelCapabilities('llama3:8b');
  assert.ok(llama3Caps.includes('chat'));
  assert.ok(llama3Caps.includes('tools'));

  // Llava (Vision)
  const llavaCaps = classifyModelCapabilities('llava:latest');
  assert.ok(llavaCaps.includes('chat'));
  assert.ok(llavaCaps.includes('vision'));
  assert.ok(!llavaCaps.includes('tools'));

  // Embedding
  const embedCaps = classifyModelCapabilities('mxbai-embed-large');
  assert.ok(embedCaps.includes('embedding'));
  assert.ok(!embedCaps.includes('chat'));
});

test('CORS Policy Verification', async (t) => {
  // Whitelisted Origin
  const resAllowed = await originalFetch(`${testUrl}/api/health`, {
    headers: { Origin: 'https://xi-io.net' }
  });
  assert.strictEqual(resAllowed.status, 200);
  assert.strictEqual(resAllowed.headers.get('access-control-allow-origin'), 'https://xi-io.net');

  // Non-whitelisted Origin
  const resBlocked = await originalFetch(`${testUrl}/api/health`, {
    headers: { Origin: 'https://attacker.com' }
  });
  assert.strictEqual(resBlocked.status, 200);
  assert.strictEqual(resBlocked.headers.get('access-control-allow-origin'), null);
});

test('API Endpoints Response & Parsing', async (t) => {
  // Health check
  const resHealth = await originalFetch(`${testUrl}/api/health`);
  assert.strictEqual(resHealth.status, 200);
  const healthData = await resHealth.json();
  assert.strictEqual(healthData.status, 'healthy');

  // Models list
  const resModels = await originalFetch(`${testUrl}/api/models`);
  assert.strictEqual(resModels.status, 200);
  const modelsData = await resModels.json();
  assert.strictEqual(modelsData.success, true);
  
  const gemma4Model = modelsData.models.find(m => m.name === 'gemma4:12b-it-qat');
  assert.ok(gemma4Model, 'gemma4 model should be returned in api/models');
  assert.deepStrictEqual(gemma4Model.capabilities, ['tools', 'chat']);
});

async function waitForRecord(filePath, expectedId, maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8').trim();
      if (content) {
        const lines = content.split('\n');
        const lastLine = lines[lines.length - 1];
        if (lastLine) {
          try {
            const parsed = JSON.parse(lastLine);
            if (parsed.id === expectedId) {
              return parsed;
            }
          } catch (err) {}
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Timeout waiting for telemetry record ${expectedId} in ${filePath}`);
}

test('EventAtom Telemetry Integrity and Schema Validation', async (t) => {
  const testPayload = { testKey: 'testVal', nested: { val: 42 } };
  const event = recordLedgerEvent('test.event.atom', testPayload);

  assert.strictEqual(event.version, 'v1');
  assert.strictEqual(event.event_subclass, 'test.event.atom');
  assert.strictEqual(event.product_id, 'xi_io_rabbit_mod');
  assert.strictEqual(event.repo, '016_Rabbit_r1');
  assert.strictEqual(event.raw_evidence_preserved, true);

  // Verify file write in LEDGER_FILE (wait for async write)
  const parsed = await waitForRecord(LEDGER_FILE, event.id);

  assert.strictEqual(parsed.id, event.id);
  assert.strictEqual(parsed.event_subclass, 'test.event.atom');

  // Verify evidence preservation
  assert.ok(parsed.raw_evidence_ref.startsWith('file://'), 'Evidence ref should be file URI');
  const evidencePath = parsed.raw_evidence_ref.replace('file://', '');
  assert.ok(fs.existsSync(evidencePath), 'Evidence file should exist');
  const evidenceContent = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  assert.deepStrictEqual(evidenceContent, testPayload);
});

test('FailureAtom Diagnostic Integrity and Schema Validation', async (t) => {
  const diag = recordDiagnostic(
    'warning',
    'test-suite',
    'TEST_FAILURE_CODE',
    'A mock failure happened during test execution',
    'Additional detail payload',
    'Fix by updating test environment settings',
    'testing'
  );

  assert.strictEqual(diag.severity, 'warning');
  assert.strictEqual(diag.source, 'test-suite');
  assert.strictEqual(diag.code, 'TEST_FAILURE_CODE');
  assert.strictEqual(diag.message, 'A mock failure happened during test execution');

  // Verify file write in DIAGNOSTICS_FILE (wait for async write)
  const parsedFailure = await waitForRecord(DIAGNOSTICS_FILE, diag.id);

  assert.strictEqual(parsedFailure.id, diag.id);
  assert.strictEqual(parsedFailure.version, 'v1');
  assert.strictEqual(parsedFailure.failure_subclass, 'TEST_FAILURE_CODE');
  assert.strictEqual(parsedFailure.severity, 'warning');

  // Verify evidence preservation
  assert.ok(parsedFailure.raw_evidence_ref.startsWith('file://'));
  const evidencePath = parsedFailure.raw_evidence_ref.replace('file://', '');
  assert.ok(fs.existsSync(evidencePath));
  const evidenceContent = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  assert.strictEqual(evidenceContent.detail, 'Additional detail payload');
  assert.strictEqual(evidenceContent.suggestedAction, 'Fix by updating test environment settings');
  assert.strictEqual(evidenceContent.relatedFeature, 'testing');
});

test('Rule-based proposal fallback when Ollama is offline', async (t) => {
  const originalGlobalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const urlStr = url.toString();
    if (urlStr.startsWith(testUrl)) {
      return originalFetch(url, options);
    }
    throw new Error('fetch failed: connection refused');
  };

  const res = await originalFetch(`${testUrl}/api/inbox/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: 'user@example.com',
      subject: 'Help: How to configure settings?',
      body: 'I need to reply to the user.'
    })
  });
  
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.ok(data.event.id);
  assert.ok(data.proposal.id);
  assert.strictEqual(data.proposal.suggested_action, 'send_reply');
  assert.strictEqual(data.proposal.parameters.recipient, 'user@example.com');
  
  globalThis.fetch = originalGlobalFetch;
});

test('Extensions Endpoint and Health Pings', async (t) => {
  const originalGlobalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const urlStr = url.toString();
    if (urlStr.includes('/api/tags')) {
      return {
        status: 200,
        statusText: 'OK',
        ok: true,
        json: async () => ({ models: [] })
      };
    }
    if (urlStr.startsWith(testUrl)) {
      return originalFetch(url, options);
    }
    // Intercept project health pings
    if (urlStr.includes('xi-io.com') || urlStr.includes('xi-io.net') || urlStr.includes('localhost:3000') || urlStr.includes('127.0.0.1')) {
      return {
        status: 200,
        statusText: 'OK',
        ok: true
      };
    }
    throw new Error(`Unexpected fetch call in test: ${url}`);
  };

  const res = await originalFetch(`${testUrl}/api/extensions`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data));
  assert.ok(data.length > 0);
  
  // Verify at least one project has status 'connected'
  const statuses = data.map(p => p.status);
  assert.ok(statuses.includes('connected'), 'At least one extension should be connected');

  globalThis.fetch = originalGlobalFetch;
});



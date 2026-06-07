// Disable TLS rejection for local testing with self-signed certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const test = require('node:test');
const assert = require('node:assert');
const { classifyModelCapabilities, server } = require('../server.js');

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

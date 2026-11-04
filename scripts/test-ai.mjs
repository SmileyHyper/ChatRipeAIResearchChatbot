import http from 'node:http';
import { handleChatStream, handleHealthCheck, handleListModels } from '../src/server/ai-router.ts';

// Start a lightweight test server on an ephemeral port
const server = http.createServer(async (req, res) => {
  const url = req.url?.split('?')[0];
  if (url === '/api/ai/health') {
    return handleHealthCheck(req, res);
  }
  if (url === '/api/ai/models') {
    return handleListModels(req, res);
  }
  if (url === '/api/ai/chat') {
    return handleChatStream(req, res);
  }
  res.statusCode = 404;
  res.end('Not Found');
});

async function runTests() {
  await new Promise((resolve) => server.listen(8499, '127.0.0.1', resolve));
  console.log('--- STARTING CHATRIPE MULTI-MODEL AI TEST SUITE ---');

  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}`);
      failed++;
    }
  }

  try {
    // TEST 1: Health Check Connectivity
    console.log('\n--- 1. Testing Health Check & Provider Connectivity ---');
    const healthRes = await fetch('http://127.0.0.1:8499/api/ai/health');
    const health = await healthRes.json();
    assert(healthRes.status === 200, 'Health endpoint responds with 200 OK');
    assert(health.ollama !== undefined, 'Ollama provider status exists in response');
    assert(health.gemini !== undefined, 'Gemini provider status exists in response');
    assert(health.claude !== undefined, 'Claude provider status exists in response');

    // TEST 2: Dynamic Model Discovery
    console.log('\n--- 2. Testing Dynamic Model Discovery ---');
    const modelsRes = await fetch('http://127.0.0.1:8499/api/ai/models');
    const modelsData = await modelsRes.json();
    assert(modelsRes.status === 200, 'Models endpoint responds with 200 OK');
    assert(Array.isArray(modelsData.models), 'Models array returned');

    const ollamaModels = modelsData.models.filter((m) => m.provider === 'ollama');
    const geminiModels = modelsData.models.filter((m) => m.provider === 'gemini');

    assert(ollamaModels.length > 0, 'At least one Ollama model found dynamically');
    assert(geminiModels.some((m) => m.id === 'gemini-2.5-flash'), 'Gemini 2.5 Flash model registered');
    assert(geminiModels.some((m) => m.id === 'gemini-2.5-pro'), 'Gemini 2.5 Pro model registered');

    // TEST 3: Validation and Error Handling - Empty Message
    console.log('\n--- 3. Testing Input Validation ---');
    const emptyMsgRes = await fetch('http://127.0.0.1:8499/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'ollama',
        model: 'llama3.2:3b',
        messages: [{ role: 'user', content: '   ' }],
      }),
    });
    const emptyErr = await emptyMsgRes.json();
    assert(emptyMsgRes.status === 400, 'Empty message rejected with status 400');
    assert(emptyErr.error && emptyErr.error.includes('empty'), 'Empty message error notification returned');

    // TEST 4: Missing Gemini API Key Handling
    console.log('\n--- 4. Testing Gemini Missing Key Handling ---');
    const missingKeyRes = await fetch('http://127.0.0.1:8499/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        messages: [{ role: 'user', content: 'Hello' }],
        settings: { geminiApiKey: '' },
      }),
    });
    const missingKeyData = await missingKeyRes.text();
    assert(missingKeyData.includes('API key is missing') || missingKeyData.includes('GEMINI_API_KEY'), 'Missing Gemini key caught with helpful prompt');

    // TEST 5: Invalid Gemini API Key Handling
    console.log('\n--- 5. Testing Gemini Invalid Key Handling ---');
    const invalidKeyRes = await fetch('http://127.0.0.1:8499/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        messages: [{ role: 'user', content: 'Hello' }],
        settings: { geminiApiKey: 'AIzaSy_fake_invalid_key_for_testing' },
      }),
    });
    const invalidKeyData = await invalidKeyRes.text();
    assert(invalidKeyData.includes('Invalid Gemini API Key') || invalidKeyData.includes('error'), 'Invalid Gemini key handled gracefully without crashing');

    // TEST 6: Ollama Non-existent Model Handling
    console.log('\n--- 6. Testing Ollama Missing Model Handling ---');
    const nonExistentModelRes = await fetch('http://127.0.0.1:8499/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'ollama',
        model: 'non-existent-model-xyz',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    });
    const nonExistentModelData = await nonExistentModelRes.text();
    assert(nonExistentModelData.includes('not found') || nonExistentModelData.includes('ollama pull'), 'Missing Ollama model advises user to pull the model');

    // TEST 7: Ollama Streaming Text Generation
    console.log('\n--- 7. Testing Ollama Streaming Chat Generation ---');
    const streamRes = await fetch('http://127.0.0.1:8499/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'ollama',
        model: 'llama3.2:3b',
        messages: [{ role: 'user', content: 'Respond with the single word: "RESEARCH"' }],
      }),
    });

    assert(streamRes.status === 200, 'Streaming endpoint returned 200');
    assert(streamRes.headers.get('content-type')?.includes('text/event-stream'), 'Content-Type is text/event-stream');

    let fullGeneratedText = '';
    let receivedChunks = 0;
    let sawDone = false;

    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const jsonStr = line.replace('data:', '').trim();
        if (jsonStr === '[DONE]') {
          sawDone = true;
          break;
        }
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.type === 'chunk' && parsed.delta) {
            fullGeneratedText += parsed.delta;
            receivedChunks++;
          }
          if (parsed.type === 'done') {
            sawDone = true;
          }
        } catch {}
      }
    }

    assert(receivedChunks > 0, 'Received real-time streaming text chunks');
    assert(sawDone, 'Stream completed with done event');
    assert(fullGeneratedText.length > 0, 'Generated text is non-empty');

    console.log('\n=============================================');
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('=============================================');

    server.close();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Fatal test runner error:', err);
    server.close();
    process.exit(1);
  }
}

runTests();


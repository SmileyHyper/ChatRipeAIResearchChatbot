import http from 'node:http';
import { handleChatStream, handleHealthCheck, handleImageAnalysis, handleListModels } from '../src/server/ai-router.ts';
import { db } from '../src/server/database/db.ts';

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
  if (url === '/api/ai/analyze-image') {
    return handleImageAnalysis(req, res);
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
    assert(health.gemini === undefined, 'Gemini provider has been removed');
    assert(health.claude !== undefined, 'Claude provider status exists in response');

    // TEST 2: Dynamic Model Discovery
    console.log('\n--- 2. Testing Dynamic Model Discovery ---');
    const modelsRes = await fetch('http://127.0.0.1:8499/api/ai/models');
    const modelsData = await modelsRes.json();
    assert(modelsRes.status === 200, 'Models endpoint responds with 200 OK');
    assert(Array.isArray(modelsData.models), 'Models array returned');

    const ollamaModels = modelsData.models.filter((m) => m.provider === 'ollama');
    assert(ollamaModels.length > 0, 'At least one Ollama model found dynamically');
    assert(!modelsData.models.some((m) => m.provider === 'gemini'), 'Gemini models are no longer listed');

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

    // TEST 4: Image analysis request validation
    console.log('\n--- 4. Testing Qwen3-VL Image Request Validation ---');
    const invalidImageRes = await fetch('http://127.0.0.1:8499/api/ai/analyze-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: 'validation-only',
        prompt: 'Describe this image',
        mimeType: 'image/png',
      }),
    });
    const invalidImageData = await invalidImageRes.json();
    assert(invalidImageRes.status === 400, 'Image request without image data rejected with status 400');
    assert(invalidImageData.error.includes('base64'), 'Image request returns a helpful validation message');

    // TEST 5: Qwen3-VL request and conversation persistence
    console.log('\n--- 5. Testing Qwen3-VL Image Analysis ---');
    const visionConversationId = `conv_qwen_test_${Date.now()}`;
    const now = Date.now();
    db.prepare(`
      INSERT INTO conversations (id, user_id, title, ai_provider, ai_model, created_at, updated_at)
      VALUES (?, 'user_default_scholar', 'New conversation', 'ollama', 'llama3.2:3b', ?, ?)
    `).run(visionConversationId, now, now);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (String(input) === 'http://missing-model.test/api/chat') {
        return new Response("model 'qwen3-vl:8b' not found", { status: 404 });
      }
      if (String(input) === 'http://clip-error.test/api/chat') {
        return new Response(JSON.stringify({
          error: 'llama-server process no longer running: exit status 1 error: Failed to load CLIP model',
        }), { status: 500 });
      }
      if (String(input) === 'http://oom.test/api/chat') {
        return new Response(JSON.stringify({
          error: 'llama-server reported out-of-memory during startup: failed to allocate compute buffers',
        }), { status: 500 });
      }
      if (String(input) === 'http://mock-ollama.test/api/chat') {
        const request = JSON.parse(init.body);
        assert(request.model === 'qwen3-vl:8b', 'Image requests use qwen3-vl:8b');
        assert(request.stream === false, 'Image requests use non-streaming Ollama chat');
        assert(request.options.num_ctx === 2048, 'Image requests limit model context to 2K');
        assert(request.messages[0].images[0] === 'aGVsbG8=', 'Base64 image is forwarded to Ollama');
        return new Response(JSON.stringify({ message: { content: 'Mock image description' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(input, init);
    };

    try {
      const imageAnalysisRes = await fetch('http://127.0.0.1:8499/api/ai/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ollama-url': 'http://mock-ollama.test' },
        body: JSON.stringify({
          conversationId: visionConversationId,
          imageBase64: 'aGVsbG8=',
          mimeType: 'image/png',
          prompt: 'Describe this image',
        }),
      });
      const imageAnalysisData = await imageAnalysisRes.json();
      assert(imageAnalysisRes.status === 200, 'Image analysis returns 200 with a local Ollama response');
      assert(imageAnalysisData.content === 'Mock image description', 'Vision response content is returned');
      const persistedMessages = db.prepare('SELECT role, content, ai_model FROM messages WHERE conversation_id = ? ORDER BY created_at')
        .all(visionConversationId);
      assert(persistedMessages.length === 2, 'Image prompt and response are saved to conversation history');
      assert(persistedMessages[1]?.ai_model === 'qwen3-vl:8b', 'Saved vision response identifies its model');

      const missingVisionRes = await fetch('http://127.0.0.1:8499/api/ai/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ollama-url': 'http://missing-model.test' },
        body: JSON.stringify({
          conversationId: visionConversationId,
          imageBase64: 'aGVsbG8=',
          mimeType: 'image/png',
          prompt: 'Describe this image',
        }),
      });
      const missingVisionData = await missingVisionRes.json();
      assert(missingVisionRes.status === 502, 'Missing vision model is reported as an upstream error');
      assert(missingVisionData.error.includes('ollama pull qwen3-vl:8b'), 'Missing vision model error includes the install command');

      const clipErrorRes = await fetch('http://127.0.0.1:8499/api/ai/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ollama-url': 'http://clip-error.test' },
        body: JSON.stringify({
          conversationId: visionConversationId,
          imageBase64: 'aGVsbG8=',
          mimeType: 'image/png',
          prompt: 'Describe this image',
        }),
      });
      const clipErrorData = await clipErrorRes.json();
      assert(clipErrorRes.status === 502, 'CLIP encoder failure is reported as an Ollama error');
      assert(clipErrorData.error.includes("could not load Qwen3-VL's CLIP vision encoder"), 'CLIP error explains the cause');
      assert(clipErrorData.error.includes('ollama rm qwen3-vl:8b'), 'CLIP error gives model recovery commands');

      const oomRes = await fetch('http://127.0.0.1:8499/api/ai/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ollama-url': 'http://oom.test' },
        body: JSON.stringify({
          conversationId: visionConversationId,
          imageBase64: 'aGVsbG8=',
          mimeType: 'image/png',
          prompt: 'Describe this image',
        }),
      });
      const oomData = await oomRes.json();
      assert(oomRes.status === 502, 'Out-of-memory failure is reported as an Ollama error');
      assert(oomData.error.includes('Close memory-heavy apps'), 'Out-of-memory error gives practical recovery guidance');
    } finally {
      globalThis.fetch = originalFetch;
      db.prepare('DELETE FROM conversations WHERE id = ?').run(visionConversationId);
    }

    // TEST 6: Keep the vision-only model out of regular text chat
    console.log('\n--- 6. Testing Qwen3-VL Text-Chat Guard ---');
    const qwenTextRes = await fetch('http://127.0.0.1:8499/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'ollama',
        model: 'qwen3-vl:8b',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    });
    const qwenTextData = await qwenTextRes.json();
    assert(qwenTextRes.status === 400, 'Qwen3-VL regular text request is rejected');
    assert(qwenTextData.error.includes('Image button'), 'Qwen3-VL text-chat error points to image analysis');

    // TEST 7: Ollama Non-existent Model Handling
    console.log('\n--- 7. Testing Ollama Missing Model Handling ---');
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

    // TEST 8: Ollama Streaming Text Generation
    console.log('\n--- 8. Testing Ollama Streaming Chat Generation ---');
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

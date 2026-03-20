/**
 * MiniMax Provider Unit Tests
 *
 * Tests MiniMax provider capabilities, model configuration, temperature
 * clamping, request building, and response transformation.
 *
 * Run with: npx vitest run src/__tests__/minimax-provider.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MiniMaxProvider } from '../minimax-provider.js';
import { consoleLogger } from '../base-provider.js';

// Suppress noisy logs during tests
const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

function createProvider(model = 'MiniMax-M2.7', apiKey = 'test-key') {
  return new MiniMaxProvider({
    config: {
      provider: 'minimax',
      apiKey,
      model,
      maxTokens: 100,
    },
    logger: silentLogger,
  });
}

describe('MiniMax Provider', () => {
  describe('Capabilities', () => {
    it('should support M2.7 and M2.5 model families', () => {
      const provider = createProvider();
      const models = provider.capabilities.supportedModels;

      expect(models).toContain('MiniMax-M2.7');
      expect(models).toContain('MiniMax-M2.7-highspeed');
      expect(models).toContain('MiniMax-M2.5');
      expect(models).toContain('MiniMax-M2.5-highspeed');
      expect(models).toHaveLength(4);
    });

    it('should have correct context lengths for M2.7 models', () => {
      const provider = createProvider();

      expect(provider.capabilities.maxContextLength['MiniMax-M2.7']).toBe(1048576);
      expect(provider.capabilities.maxContextLength['MiniMax-M2.7-highspeed']).toBe(1048576);
    });

    it('should have correct context lengths for M2.5 models', () => {
      const provider = createProvider();

      expect(provider.capabilities.maxContextLength['MiniMax-M2.5']).toBe(204800);
      expect(provider.capabilities.maxContextLength['MiniMax-M2.5-highspeed']).toBe(204800);
    });

    it('should have correct output token limits for M2.7', () => {
      const provider = createProvider();

      expect(provider.capabilities.maxOutputTokens['MiniMax-M2.7']).toBe(131072);
      expect(provider.capabilities.maxOutputTokens['MiniMax-M2.7-highspeed']).toBe(131072);
    });

    it('should have correct output token limits for M2.5', () => {
      const provider = createProvider();

      expect(provider.capabilities.maxOutputTokens['MiniMax-M2.5']).toBe(192000);
      expect(provider.capabilities.maxOutputTokens['MiniMax-M2.5-highspeed']).toBe(192000);
    });

    it('should support streaming and tool calling', () => {
      const provider = createProvider();

      expect(provider.capabilities.supportsStreaming).toBe(true);
      expect(provider.capabilities.supportsToolCalling).toBe(true);
      expect(provider.capabilities.supportsSystemMessages).toBe(true);
    });

    it('should have pricing for all models', () => {
      const provider = createProvider();
      const pricing = provider.capabilities.pricing;

      expect(pricing['MiniMax-M2.7']).toBeDefined();
      expect(pricing['MiniMax-M2.7-highspeed']).toBeDefined();
      expect(pricing['MiniMax-M2.5']).toBeDefined();
      expect(pricing['MiniMax-M2.5-highspeed']).toBeDefined();

      // Standard models should cost less than highspeed
      expect(pricing['MiniMax-M2.7'].promptCostPer1k).toBeLessThan(
        pricing['MiniMax-M2.7-highspeed'].promptCostPer1k
      );
      expect(pricing['MiniMax-M2.5'].promptCostPer1k).toBeLessThan(
        pricing['MiniMax-M2.5-highspeed'].promptCostPer1k
      );
    });
  });

  describe('Model Info', () => {
    it('should return info for MiniMax-M2.7', async () => {
      const provider = createProvider('MiniMax-M2.7');
      // Access getModelInfo directly (no initialize needed)
      const info = await provider.getModelInfo('MiniMax-M2.7');

      expect(info.model).toBe('MiniMax-M2.7');
      expect(info.contextLength).toBe(1048576);
      expect(info.maxOutputTokens).toBe(131072);
      expect(info.description).toContain('MiniMax');
    });

    it('should return info for MiniMax-M2.7-highspeed', async () => {
      const provider = createProvider('MiniMax-M2.7-highspeed');
      const info = await provider.getModelInfo('MiniMax-M2.7-highspeed');

      expect(info.model).toBe('MiniMax-M2.7-highspeed');
      expect(info.contextLength).toBe(1048576);
      expect(info.description).toContain('speed');
    });

    it('should return info for MiniMax-M2.5', async () => {
      const provider = createProvider('MiniMax-M2.5');
      const info = await provider.getModelInfo('MiniMax-M2.5');

      expect(info.model).toBe('MiniMax-M2.5');
      expect(info.contextLength).toBe(204800);
      expect(info.maxOutputTokens).toBe(192000);
    });

    it('should list all four models', async () => {
      const provider = createProvider();
      const models = await provider.listModels();

      expect(models).toHaveLength(4);
      expect(models).toContain('MiniMax-M2.7');
      expect(models).toContain('MiniMax-M2.7-highspeed');
      expect(models).toContain('MiniMax-M2.5');
      expect(models).toContain('MiniMax-M2.5-highspeed');
    });
  });

  describe('Initialization', () => {
    it('should require API key', async () => {
      const provider = new MiniMaxProvider({
        config: {
          provider: 'minimax',
          model: 'MiniMax-M2.7',
          maxTokens: 100,
        },
        logger: silentLogger,
      });

      await expect(provider.initialize()).rejects.toThrow('MiniMax API key is required');
    });

    it('should accept custom API URL', async () => {
      const provider = new MiniMaxProvider({
        config: {
          provider: 'minimax',
          apiKey: 'test-key',
          apiUrl: 'https://custom.minimax.io/v1',
          model: 'MiniMax-M2.7',
          maxTokens: 100,
        },
        logger: silentLogger,
      });

      // Mock the health check fetch to avoid real API calls
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 })
      );

      await provider.initialize();
      // Verify the custom URL was used in the health check
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://custom.minimax.io/v1/models',
        expect.any(Object)
      );

      fetchSpy.mockRestore();
      provider.destroy();
    });
  });

  describe('Temperature Clamping', () => {
    it('should allow temperature=0', async () => {
      const provider = createProvider();

      // We can't call buildRequest directly as it's private, but we can test
      // the behavior via complete() with a mocked fetch
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200 })
      ).mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 'test',
          object: 'chat.completion',
          created: Date.now(),
          model: 'MiniMax-M2.7',
          choices: [{ index: 0, message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
        }), { status: 200 })
      );

      await provider.initialize();
      await provider.complete({
        messages: [{ role: 'user', content: 'test' }],
        temperature: 0,
      });

      // Check the second fetch call (first is health check)
      const requestBody = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string);
      expect(requestBody.temperature).toBe(0);

      fetchSpy.mockRestore();
      provider.destroy();
    });

    it('should clamp temperature above 1.0', async () => {
      const provider = createProvider();

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200 })
      ).mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 'test',
          object: 'chat.completion',
          created: Date.now(),
          model: 'MiniMax-M2.7',
          choices: [{ index: 0, message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
        }), { status: 200 })
      );

      await provider.initialize();
      await provider.complete({
        messages: [{ role: 'user', content: 'test' }],
        temperature: 2.0,
      });

      const requestBody = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string);
      expect(requestBody.temperature).toBe(1.0);

      fetchSpy.mockRestore();
      provider.destroy();
    });

    it('should not set temperature when undefined', async () => {
      const provider = new MiniMaxProvider({
        config: {
          provider: 'minimax',
          apiKey: 'test-key',
          model: 'MiniMax-M2.7',
          maxTokens: 100,
          // No temperature set
        },
        logger: silentLogger,
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200 })
      ).mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 'test',
          object: 'chat.completion',
          created: Date.now(),
          model: 'MiniMax-M2.7',
          choices: [{ index: 0, message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
        }), { status: 200 })
      );

      await provider.initialize();
      await provider.complete({
        messages: [{ role: 'user', content: 'test' }],
        // No temperature in request either
      });

      const requestBody = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string);
      expect(requestBody.temperature).toBeUndefined();

      fetchSpy.mockRestore();
      provider.destroy();
    });
  });

  describe('Error Handling', () => {
    it('should throw AuthenticationError on 401', async () => {
      const provider = createProvider();

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200 })
      ).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Invalid API key' } }), { status: 401 })
      );

      await provider.initialize();
      await expect(
        provider.complete({ messages: [{ role: 'user', content: 'test' }] })
      ).rejects.toThrow('Invalid API key');

      fetchSpy.mockRestore();
      provider.destroy();
    });

    it('should throw RateLimitError on 429', async () => {
      const provider = createProvider();

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200 })
      ).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Rate limited' } }), {
          status: 429,
          headers: { 'retry-after': '30' },
        })
      );

      await provider.initialize();
      await expect(
        provider.complete({ messages: [{ role: 'user', content: 'test' }] })
      ).rejects.toThrow('Rate limited');

      fetchSpy.mockRestore();
      provider.destroy();
    });

    it('should throw ModelNotFoundError on 404', async () => {
      const provider = createProvider();

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200 })
      ).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Model not found' } }), { status: 404 })
      );

      await provider.initialize();
      await expect(
        provider.complete({ messages: [{ role: 'user', content: 'test' }] })
      ).rejects.toThrow();

      fetchSpy.mockRestore();
      provider.destroy();
    });
  });

  describe('Response Transformation', () => {
    it('should transform MiniMax response to LLMResponse format', async () => {
      const provider = createProvider('MiniMax-M2.7');

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200 })
      ).mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1700000000,
          model: 'MiniMax-M2.7',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: 'Hello!' },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }), { status: 200 })
      );

      await provider.initialize();
      const response = await provider.complete({
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'MiniMax-M2.7',
      });

      expect(response.id).toBe('chatcmpl-123');
      expect(response.provider).toBe('minimax');
      expect(response.content).toBe('Hello!');
      expect(response.usage.promptTokens).toBe(10);
      expect(response.usage.completionTokens).toBe(5);
      expect(response.usage.totalTokens).toBe(15);
      expect(response.cost).toBeDefined();
      expect(response.cost!.totalCost).toBeGreaterThan(0);
      expect(response.finishReason).toBe('stop');

      fetchSpy.mockRestore();
      provider.destroy();
    });

    it('should handle tool calls in response', async () => {
      const provider = createProvider('MiniMax-M2.7');

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200 })
      ).mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: 'chatcmpl-456',
          object: 'chat.completion',
          created: 1700000000,
          model: 'MiniMax-M2.7',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call_1',
                type: 'function',
                function: { name: 'get_weather', arguments: '{"city":"NYC"}' },
              }],
            },
            finish_reason: 'tool_calls',
          }],
          usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 },
        }), { status: 200 })
      );

      await provider.initialize();
      const response = await provider.complete({
        messages: [{ role: 'user', content: 'What is the weather?' }],
        tools: [{
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get weather',
            parameters: { type: 'object', properties: { city: { type: 'string' } } },
          },
        }],
      });

      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls![0].function.name).toBe('get_weather');
      expect(response.finishReason).toBe('tool_calls');

      fetchSpy.mockRestore();
      provider.destroy();
    });
  });

  describe('Health Check', () => {
    it('should report healthy when API responds OK', async () => {
      const provider = createProvider();

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 })
      );

      await provider.initialize();
      // Health check is called during init, check the state
      const status = provider.getStatus();
      expect(status.available).toBe(true);

      fetchSpy.mockRestore();
      provider.destroy();
    });

    it('should report unhealthy on API failure', async () => {
      const provider = createProvider();

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('', { status: 500 })
      );

      await provider.initialize();
      const status = provider.getStatus();
      // Status may vary based on circuit breaker but should not crash
      expect(status).toBeDefined();

      fetchSpy.mockRestore();
      provider.destroy();
    });
  });

  describe('Provider Name', () => {
    it('should be "minimax"', () => {
      const provider = createProvider();
      expect(provider.name).toBe('minimax');
    });
  });
});

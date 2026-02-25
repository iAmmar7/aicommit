import type { Config } from './types.js';
import { OllamaError } from './errors.js';
import { SYSTEM_PROMPT, getUserPrompt } from './prompts.js';

export async function getLocalModels(
  tagsUrl: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<string[]> {
  let response: Response;
  try {
    response = await fetchFn(tagsUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new OllamaError(
      `Could not connect to Ollama: ${msg}. Make sure it is running with: ollama serve`,
    );
  }

  if (!response.ok) {
    throw new OllamaError(`Ollama returned an error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (!Array.isArray(data?.models)) {
    throw new OllamaError('Unexpected response from Ollama: missing "models" list');
  }
  return (data.models as { name: string }[]).map((m) => m.name);
}

export async function generateCommitMessage(
  diff: string,
  config: Config,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<string> {
  const body = {
    model: config.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: getUserPrompt(diff) },
    ],
    stream: false,
  };

  if (config.debug) {
    console.error('\n[DEBUG] Request body:\n', JSON.stringify(body, null, 2));
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  let response: Response;
  try {
    response = await fetchFn(config.ollamaUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new OllamaError(
      `Could not connect to Ollama: ${msg}. Make sure it is running with: ollama serve`,
    );
  }

  if (!response.ok) {
    throw new OllamaError(`Ollama returned an error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (config.debug) {
    console.error('\n[DEBUG] Raw response:\n', JSON.stringify(data, null, 2));
  }

  const content = data?.message?.content;
  if (typeof content !== 'string') {
    throw new OllamaError('Unexpected response from Ollama: missing "message.content"');
  }
  return content.trim();
}

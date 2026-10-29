/**
 * GET /api/health
 * Reports whether AI and Supabase are configured. Never returns secret values.
 */
interface ApiRequest {
  method?: string;
}
interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

function env(name: string): string {
  return (process.env[name] ?? '').trim();
}

export default function handler(req: ApiRequest, res: ApiResponse): void {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }
  const provider = (env('AI_PROVIDER') || 'gemini').toLowerCase();
  const keyName: Record<string, string> = {
    gemini: 'GEMINI_API_KEY',
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
  };
  const modelName: Record<string, [string, string]> = {
    gemini: ['GEMINI_MODEL', 'gemini-2.5-flash'],
    openai: ['OPENAI_MODEL', 'gpt-4o-mini'],
    anthropic: ['ANTHROPIC_MODEL', 'claude-sonnet-5-5'],
  };
  const known = provider in keyName;
  const aiConfigured = known && env(keyName[provider]).length > 0;
  const model = known ? env(modelName[provider][0]) || modelName[provider][1] : '';
  res.status(200).json({
    ok: true,
    aiConfigured,
    provider: known ? provider : `unknown (${provider})`,
    model: aiConfigured ? model : '',
    authRequired: env('AI_REQUIRE_AUTH').toLowerCase() === 'true',
    message: aiConfigured
      ? 'AI is configured on the server.'
      : known
        ? `AI is not configured. Add ${keyName[provider]} in your environment variables and redeploy.`
        : 'AI_PROVIDER must be gemini, openai or anthropic.',
  });
}

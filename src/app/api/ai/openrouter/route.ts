import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  let body: any = {};

  try {
    body = await request.json();
    const { apiKey, model = 'openai/gpt-4o-mini', messages, temperature = 0.95, max_tokens = 600 } = body;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenRouter API key is required', details: 'Pass apiKey in the request body' },
        { status: 400 }
      );
    }

    if (!messages?.length) {
      return NextResponse.json(
        { error: 'Missing required field: messages', details: 'Request validation failed' },
        { status: 400 }
      );
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://xautomate9558.builtwithrocket.new',
        'X-Title': 'XAutomate',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`OpenRouter API error ${response.status}: ${errBody}`);
      return NextResponse.json(
        { error: `OpenRouter API error: ${response.status}`, details: errBody },
        { status: response.status }
      );
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? '';

    return NextResponse.json({ content: content.trim() });
  } catch (error) {
    console.error('OpenRouter route error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

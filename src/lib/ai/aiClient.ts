function getBaseUrl(): string {
  // On the server side, use the site URL env var
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_SITE_URL || '';
  }
  // On the client side, use the current origin
  return window.location.origin;
}

export async function callAIEndpoint(endpoint: string, payload: object) {
  try {
    const base = getBaseUrl();
    const url = base ? `${base}${endpoint}` : endpoint;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      console.error('API Route Error:', {
        error: data.error,
        details: data.details,
      });
      throw new Error(data.error || `Request failed: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
}

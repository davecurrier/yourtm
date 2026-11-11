/**
 * Shared WordPress REST API fetch utility with timeout
 */
export async function wpFetch(url: string, apiKey: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-YourTM-Key': apiKey,
        ...options.headers,
      },
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

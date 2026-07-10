// Backend error responses are always JSON `{ error: string }`. Extracts that message instead
// of surfacing the raw response body — without this, callers doing `new Error(await res.text())`
// end up displaying the literal JSON string (e.g. `{"error":"..."}`) to the user.
export async function apiErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.error === 'string') return parsed.error;
  } catch {
    // Not JSON — fall through to the raw text.
  }
  return text || `Request failed (${res.status})`;
}

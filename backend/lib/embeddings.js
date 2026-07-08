// Voyage AI embeddings — recommended pairing with Claude, has a free tier.
// Swap this file for OpenAI's embeddings endpoint if you'd rather use that instead;
// nothing else in the codebase needs to change since callers just get back a number[].
//
// Voyage accounts without a payment method on file are capped at 3 requests/minute
// (the free token allowance still applies either way — adding a card just unlocks
// higher throughput). Since this app can easily fire off 20-30 embedding calls in a
// single job refresh, we throttle every call to stay under that cap, and retry with
// backoff if a 429 slips through anyway (e.g. another request racing in). If you've
// added a payment method, lower VOYAGE_MIN_INTERVAL_MS in your .env to speed this up.

const MIN_INTERVAL_MS = Number(process.env.VOYAGE_MIN_INTERVAL_MS) || 21000; // ~3 RPM, +1s buffer
let nextAvailableAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Serializes calls so they're spaced at least MIN_INTERVAL_MS apart, even if
// several embedText() calls are kicked off concurrently.
async function throttle() {
  const wait = Math.max(0, nextAvailableAt - Date.now());
  nextAvailableAt = Math.max(nextAvailableAt, Date.now()) + MIN_INTERVAL_MS;
  if (wait > 0) await sleep(wait);
}

async function embedText(text, { retries = 3 } = {}) {
  await throttle();

  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: text,
      model: 'voyage-3-lite',
    }),
  });

  if (res.status === 429 && retries > 0) {
    // Got rate-limited despite throttling (e.g. concurrent requests) — back off
    // an extra interval and try again rather than losing this job entirely.
    console.warn(`Voyage rate-limited, retrying in ${MIN_INTERVAL_MS}ms (${retries} retries left)`);
    await sleep(MIN_INTERVAL_MS);
    return embedText(text, { retries: retries - 1 });
  }

  if (!res.ok) {
    throw new Error(`Embedding request failed: ${await res.text()}`);
  }

  const data = await res.json();
  return data.data[0].embedding; // 512-dim for voyage-3-lite — matches schema.sql's vector(512) columns
}

module.exports = { embedText };

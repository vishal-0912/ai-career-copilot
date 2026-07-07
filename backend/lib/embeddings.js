// Voyage AI embeddings — recommended pairing with Claude, has a free tier.
// Swap this file for OpenAI's embeddings endpoint if you'd rather use that instead;
// nothing else in the codebase needs to change since callers just get back a number[].
async function embedText(text) {
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

  if (!res.ok) {
    throw new Error(`Embedding request failed: ${await res.text()}`);
  }

  const data = await res.json();
  return data.data[0].embedding; // number[] of length 1536... (voyage-3-lite is 512, see note below)
}

module.exports = { embedText };

// NOTE: voyage-3-lite returns 512-dim vectors, not 1536. Either:
//   (a) change the schema.sql `vector(1536)` columns to `vector(512)`, or
//   (b) use "voyage-3" (1024-dim) or an OpenAI model that matches 1536.
// Pick one and keep the schema and this file in sync before Day 2.

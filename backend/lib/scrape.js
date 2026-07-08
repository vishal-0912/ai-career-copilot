const cheerio = require('cheerio');

// Fetches a URL and returns cleaned, boilerplate-stripped body text for the LLM to parse.
// Works well for plain server-rendered pages (most company careers pages). LinkedIn and
// Naukri listing pages are heavily JS-rendered and/or bot-protected, so a plain fetch may
// return a near-empty shell for those — if that becomes a blocker, swap this for a headless
// browser (Playwright) call instead; nothing else in the pipeline needs to change since
// callers just get back a string either way.
async function fetchPageText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    throw new Error(`Could not fetch URL (${res.status})`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  $('script, style, nav, footer, header, noscript, svg').remove();

  const text = $('body').text().replace(/\s+/g, ' ').trim();

  if (text.length < 200) {
    throw new Error(
      'Page returned almost no readable text — it may require JavaScript to render (common on LinkedIn/Naukri) or be blocking automated requests.'
    );
  }

  return text.slice(0, 15000); // keep the prompt sane
}

module.exports = { fetchPageText };

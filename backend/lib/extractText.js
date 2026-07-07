const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

// Downloads the file from its (signed, Supabase Storage) URL and extracts plain text,
// dispatching on the ORIGINAL filename — signed URLs have a query string appended,
// so checking the URL's extension directly would break. Add more formats here as needed.
async function extractTextFromUrl(fileUrl, fileName) {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Could not download file: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const name = (fileName || fileUrl).toLowerCase();

  if (name.endsWith('.pdf')) {
    const parsed = await pdfParse(buffer);
    return parsed.text;
  }

  if (name.endsWith('.docx')) {
    const parsed = await mammoth.extractRawText({ buffer });
    return parsed.value;
  }

  throw new Error('Unsupported file type — only .pdf and .docx are supported');
}

module.exports = { extractTextFromUrl };
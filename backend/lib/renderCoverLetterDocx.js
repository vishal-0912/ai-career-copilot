const { Document, Packer, Paragraph, TextRun } = require('docx');

// Standard business-letter layout: date, salutation, body paragraphs (split on blank
// lines from Claude's output), sign-off. Plain single-column, same ATS-safe reasoning
// as the resume renderer, though cover letters aren't machine-parsed the way resumes are.
async function renderCoverLetterDocx({ body, candidateName, jdTitle, jdCompany }) {
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const children = [
    new Paragraph({ text: today, spacing: { after: 240 } }),
    new Paragraph({
      text: `Re: Application for ${jdTitle || 'the role'}${jdCompany ? ` at ${jdCompany}` : ''}`,
      spacing: { after: 240 },
    }),
    new Paragraph({ text: 'Dear Hiring Manager,', spacing: { after: 200 } }),
    ...paragraphs.map((p) => new Paragraph({ text: p, spacing: { after: 200 } })),
    new Paragraph({ text: 'Sincerely,', spacing: { before: 200, after: 60 } }),
    new Paragraph({
      children: [new TextRun({ text: candidateName || 'Candidate', bold: true })],
    }),
  ];

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}

module.exports = { renderCoverLetterDocx };

const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

// Deliberately plain, single-column layout — no tables, text boxes, columns, or images.
// Those are exactly the things that break real ATS parsers, so the DOCX structure itself
// is part of the "ATS-safe" claim, not just the text content.
function sectionHeading(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
  });
}

function bulletParagraph(text) {
  return new Paragraph({
    text,
    bullet: { level: 0 },
    spacing: { after: 60 },
  });
}

// resume: the structured JSON from tailorResumeContent() — { summary, skills, experience, education }
// contact: { fullName, email, phone } from the candidate's profile
async function renderResumeDocx(resume, contact) {
  const children = [];

  children.push(
    new Paragraph({
      children: [new TextRun({ text: contact.fullName || 'Candidate', bold: true, size: 32 })],
      spacing: { after: 60 },
    })
  );

  const contactLine = [contact.email, contact.phone].filter(Boolean).join('  |  ');
  if (contactLine) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: contactLine, size: 20, color: '555555' })],
        spacing: { after: 200 },
      })
    );
  }

  if (resume.summary) {
    children.push(sectionHeading('Summary'));
    children.push(new Paragraph({ text: resume.summary, spacing: { after: 120 } }));
  }

  if (resume.skills?.length) {
    children.push(sectionHeading('Skills'));
    children.push(new Paragraph({ text: resume.skills.join(', '), spacing: { after: 120 } }));
  }

  if (resume.experience?.length) {
    children.push(sectionHeading('Experience'));
    for (const job of resume.experience) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${job.title || ''}`, bold: true }),
            new TextRun({ text: job.company ? `, ${job.company}` : '' }),
          ],
          spacing: { before: 120 },
        })
      );
      if (job.dates) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: job.dates, italics: true, size: 20, color: '555555' })],
            spacing: { after: 60 },
          })
        );
      }
      for (const bullet of job.bullets || []) {
        children.push(bulletParagraph(bullet));
      }
    }
  }

  if (resume.education?.length) {
    children.push(sectionHeading('Education'));
    for (const edu of resume.education) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: edu.degree || '', bold: true }),
            new TextRun({ text: edu.school ? `, ${edu.school}` : '' }),
            new TextRun({ text: edu.dates ? `  (${edu.dates})` : '', size: 20, color: '555555' }),
          ],
          spacing: { after: 60 },
        })
      );
    }
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}

module.exports = { renderResumeDocx };

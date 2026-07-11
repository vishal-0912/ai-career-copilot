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

// resume: the structured JSON from tailorResumeContent() —
//   { headline, summary, skills, experience, projects, certifications, education }
// contact: { fullName, email, phone } from the candidate's profile
async function renderResumeDocx(resume, contact) {
  const children = [];

  children.push(
    new Paragraph({
      children: [new TextRun({ text: contact.fullName || 'Candidate', bold: true, size: 32 })],
      spacing: { after: 60 },
    })
  );

  // Headline (job title line) sits directly under the name, matching standard resume format —
  // this is what recruiters and ATS title-matching look at first, so it can't be missing.
  if (resume.headline) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: resume.headline, bold: true, size: 22 })],
        spacing: { after: 60 },
      })
    );
  }

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

  // Projects — preserved from the original resume (never dropped) and placed right after
  // Experience, matching standard resume order. Their rewritten bullets are a legitimate
  // extra surface for JD keywords without touching the (truthful, unembellished) job history.
  if (resume.projects?.length) {
    children.push(sectionHeading('Projects'));
    for (const project of resume.projects) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: project.name || '', bold: true })],
          spacing: { before: 120 },
        })
      );
      if (project.context) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: project.context, italics: true, size: 20, color: '555555' })],
            spacing: { after: 60 },
          })
        );
      }
      for (const bullet of project.bullets || []) {
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

  // Certifications — preserved from the original resume if present; never dropped.
  if (resume.certifications?.length) {
    children.push(sectionHeading('Certifications'));
    for (const cert of resume.certifications) {
      children.push(bulletParagraph(cert));
    }
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}

module.exports = { renderResumeDocx };

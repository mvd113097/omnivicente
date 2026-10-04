import JSZip from 'jszip';
import { Store } from './store.js';

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates a clean, standards-compliant EPUB 3 file for contiguous completed chapters.
 * READ-ONLY SNAPSHOT: DOES NOT mutate translation state or interfere with background workers.
 */
export async function generateContiguousEpub(
  jobId: string,
  bookTitle?: string
): Promise<{ buffer: Buffer; chapterCount: number }> {
  const job = await Store.getJob(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  // Never-Skip contiguous completed chapters
  const chapters = await Store.getContiguousCompletedChapters(jobId);
  const title = bookTitle || job.filename.replace(/\.txt$/i, '');
  const zip = new JSZip();

  // 1. mimetype (MUST be first and uncompressed)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. META-INF/container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.file('META-INF/container.xml', containerXml);

  // 3. OEBPS/stylesheet.css
  const stylesheetCss = `
body {
  font-family: serif;
  line-height: 1.6;
  margin: 1.5em;
  color: #111;
}
h1 {
  font-size: 1.8em;
  margin-top: 1.5em;
  margin-bottom: 0.8em;
  text-align: center;
  border-bottom: 1px solid #ddd;
  padding-bottom: 0.3em;
}
p {
  margin: 0;
  text-indent: 2em;
  margin-bottom: 0.5em;
}
`;
  zip.file('OEBPS/stylesheet.css', stylesheetCss);

  // 4. Chapter files (OEBPS/ch_*.xhtml)
  const manifestItems: string[] = [
    `<item id="css" href="stylesheet.css" media-type="text/css"/>`,
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
  ];
  const spineItems: string[] = [];
  const ncxNavPoints: string[] = [];
  const navListItems: string[] = [];

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const chId = `ch_${i + 1}`;
    const filename = `ch_${i + 1}.xhtml`;

    manifestItems.push(`<item id="${chId}" href="${filename}" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="${chId}"/>`);

    ncxNavPoints.push(`
    <navPoint id="navPoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(ch.title)}</text></navLabel>
      <content src="${filename}"/>
    </navPoint>`);

    navListItems.push(`<li><a href="${filename}">${escapeXml(ch.title)}</a></li>`);

    // Split paragraphs
    const paragraphs = ch.translatedContent
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const parasHtml = paragraphs.map((p) => `<p>${escapeXml(p)}</p>`).join('\n');

    const chXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeXml(ch.title)}</title>
  <link rel="stylesheet" type="text/css" href="stylesheet.css" />
</head>
<body>
  <h1>${escapeXml(ch.title)}</h1>
  ${parasHtml}
</body>
</html>`;
    zip.file(`OEBPS/${filename}`, chXhtml);
  }

  // 5. OEBPS/nav.xhtml (EPUB 3 nav)
  const navXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en">
<head>
  <meta charset="utf-8" />
  <title>Table of Contents</title>
  <link rel="stylesheet" type="text/css" href="stylesheet.css" />
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
      ${navListItems.join('\n')}
    </ol>
  </nav>
</body>
</html>`;
  zip.file('OEBPS/nav.xhtml', navXhtml);

  // 6. OEBPS/toc.ncx (EPUB 2 backward compatibility)
  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${job.id}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
    ${ncxNavPoints.join('\n')}
  </navMap>
</ncx>`;
  zip.file('OEBPS/toc.ncx', tocNcx);

  // 7. OEBPS/content.opf
  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>en</dc:language>
    <dc:identifier id="BookId">urn:uuid:${job.id}</dc:identifier>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.[0-9]+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join('\n    ')}
  </spine>
</package>`;
  zip.file('OEBPS/content.opf', contentOpf);

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return { buffer, chapterCount: chapters.length };
}

/**
 * Generates a clean plain-text output file for contiguous completed chapters.
 * READ-ONLY SNAPSHOT: DOES NOT mutate translation state.
 */
export async function generateContiguousTxt(
  jobId: string,
  bookTitle?: string
): Promise<{ text: string; chapterCount: number }> {
  const job = await Store.getJob(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  // Never-Skip contiguous completed chapters
  const chapters = await Store.getContiguousCompletedChapters(jobId);
  const title = bookTitle || job.filename.replace(/\.txt$/i, '');

  let output = `${title}\n\n`;

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    output += `\n\n========================================\n`;
    output += `${ch.title}\n`;
    output += `========================================\n\n`;
    output += `${ch.translatedContent.trim()}\n`;
  }

  return { text: output, chapterCount: chapters.length };
}

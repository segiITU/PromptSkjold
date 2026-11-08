/** One page of the output: a JPEG picture of the page, sized in PDF points. */
export interface JpegPage {
  jpeg: Uint8Array;
  /** Picture size in pixels. */
  pxWidth: number;
  pxHeight: number;
  /** Page size in PDF points (1/72 inch). */
  ptWidth: number;
  ptHeight: number;
}

const encoder = new TextEncoder();

/**
 * Build a PDF whose pages are the given pictures. Nothing but the picture is
 * in the file, so whatever was blacked out in the picture is gone for good.
 * Written by hand because it is a few dozen lines and needs no library.
 */
export function buildPdfFromJpegs(pages: JpegPage[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = []; // offsets[n] = byte position of object n
  let length = 0;
  const push = (data: Uint8Array | string): void => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (n: number, body: string | Uint8Array[]): void => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    if (typeof body === 'string') push(body);
    else for (const part of body) push(part);
    push('\nendobj\n');
  };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  // Objects: 1 catalog, 2 page tree, then three per page (page, content, image).
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  pages.forEach((page, i) => {
    const pageNo = 3 + i * 3;
    const contentNo = pageNo + 1;
    const imageNo = pageNo + 2;
    const w = page.ptWidth.toFixed(2);
    const h = page.ptHeight.toFixed(2);
    object(
      pageNo,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${imageNo} 0 R >> >> /Contents ${contentNo} 0 R >>`,
    );
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    object(contentNo, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    object(imageNo, [
      encoder.encode(
        `<< /Type /XObject /Subtype /Image /Width ${page.pxWidth} /Height ${page.pxHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
      ),
      page.jpeg,
      encoder.encode('\nendstream'),
    ]);
  });

  const count = 3 + pages.length * 3;
  const xrefAt = length;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

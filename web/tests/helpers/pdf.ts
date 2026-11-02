/**
 * A tiny PDF writer for tests: one page per entry of `pages`, each line drawn in Helvetica with
 * a real xref table, so PDF.js (unpdf) extracts the text exactly like a department's PDF.
 * ASCII text only.
 *
 *   const bytes = makePdf([["CSC 4350 Syllabus", "Grading: Exams 50%"]]);
 */
export function makePdf(pages: string[][]): Uint8Array<ArrayBuffer> {
  const escape = (line: string) => line.replace(/[\\()]/g, (c) => `\\${c}`);
  const objects: string[] = [];
  const pageCount = pages.length;
  // 1: catalog, 2: pages, 3: font, then per page: page object + content stream.
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  pages.forEach((lines, i) => {
    const content = `BT /F1 10 Tf 14 TL 50 760 Td ${lines.map((l) => `(${escape(l)}) Tj T*`).join(" ")} ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${5 + i * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
    );
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

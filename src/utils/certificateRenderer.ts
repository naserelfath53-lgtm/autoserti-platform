import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import type { ExportFormat, TemplateField, TemplateRecord } from '../types';
import { resolveFieldText } from './certificateLogic';

const BASE_LANDSCAPE = { width: 1600, height: 1131 };
const BASE_PORTRAIT = { width: 1131, height: 1600 };

function getCanvasDimensions(orientation: 'landscape' | 'portrait') {
  return orientation === 'portrait' ? BASE_PORTRAIT : BASE_LANDSCAPE;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let currentLine = words[0];
    for (let i = 1; i < words.length; i++) {
      const testLine = `${currentLine} ${words[i]}`;
      if (ctx.measureText(testLine).width <= maxWidth) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = words[i];
      }
    }
    lines.push(currentLine);
  }
  return lines;
}

export async function renderCertificateToDataUrl(params: {
  template: TemplateRecord;
  row: Record<string, string>;
  rowIndex: number;
  mapping: Record<string, string>;
  overrides?: Record<string, string>;
  numberPrefix?: string;
  cachedBgImage?: HTMLImageElement | null;
}): Promise<string> {
  const { template, row, rowIndex, mapping, overrides, numberPrefix, cachedBgImage } = params;
  const dims = getCanvasDimensions(template.orientation);
  const canvas = document.createElement('canvas');
  canvas.width = dims.width;
  canvas.height = dims.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context tidak tersedia.');

  try {
    await document.fonts.ready;
  } catch {
    // ignore font readiness error
  }

  // Fallback clean parchment backdrop
  ctx.fillStyle = '#FAFAF8';
  ctx.fillRect(0, 0, dims.width, dims.height);

  const bgImg = cachedBgImage !== undefined ? cachedBgImage : await loadImage(template.backgroundUrl);
  if (bgImg) {
    // Cover fit
    const scale = Math.max(dims.width / bgImg.width, dims.height / bgImg.height);
    const drawW = bgImg.width * scale;
    const drawH = bgImg.height * scale;
    const dx = (dims.width - drawW) / 2;
    const dy = (dims.height - drawH) / 2;
    ctx.drawImage(bgImg, dx, dy, drawW, drawH);
  } else {
    // Crisp fallback border if background asset cannot load
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 8;
    ctx.strokeRect(36, 36, dims.width - 72, dims.height - 72);
    ctx.strokeStyle = '#B45309';
    ctx.lineWidth = 2;
    ctx.strokeRect(52, 52, dims.width - 104, dims.height - 104);
  }

  const scaleFactor = dims.width / 1200;

  for (const field of template.fields as TemplateField[]) {
    const text = resolveFieldText({
      field,
      row,
      rowIndex,
      mapping,
      overrides,
      numberPrefix,
    });
    if (!text) continue;

    const fontPx = Math.round(field.fontSize * scaleFactor);
    const weight = field.fontWeight || '400';
    const family = field.fontFamily || 'Plus Jakarta Sans';
    ctx.font = `${weight} ${fontPx}px "${family}", sans-serif`;
    ctx.fillStyle = field.color || '#0F172A';
    ctx.textBaseline = 'middle';

    const maxWidthPx = (field.width / 100) * dims.width;
    const anchorX = (field.x / 100) * dims.width;
    const anchorY = (field.y / 100) * dims.height;

    if (field.align === 'left') {
      ctx.textAlign = 'left';
    } else if (field.align === 'right') {
      ctx.textAlign = 'right';
    } else {
      ctx.textAlign = 'center';
    }

    const lines = wrapTextLines(ctx, text, maxWidthPx);
    const lineHeight = fontPx * 1.28;
    const totalHeight = lines.length * lineHeight;
    const startY = anchorY - totalHeight / 2 + lineHeight / 2;

    lines.forEach((line, lineIdx) => {
      ctx.fillText(line, anchorX, startY + lineIdx * lineHeight);
    });
  }

  return canvas.toDataURL('image/png', 0.95);
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function sanitizeSlug(name: string): string {
  return (name || 'peserta')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'sertifikat';
}

export async function exportCertificateBatch(params: {
  template: TemplateRecord;
  rows: Array<Record<string, string>>;
  mapping: Record<string, string>;
  overridesByRow: Record<number, Record<string, string>>;
  numberPrefix: string;
  format: ExportFormat;
  baseFileName: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<Array<{ index: number; name: string; base64Pdf: string; fileName: string }>> {
  const { template, rows, mapping, overridesByRow, numberPrefix, format, baseFileName, onProgress } = params;
  const cachedBg = await loadImage(template.backgroundUrl);
  const isPortrait = template.orientation === 'portrait';
  const emailAttachments: Array<{ index: number; name: string; base64Pdf: string; fileName: string }> = [];

  const nameField = template.fields.find((f) => f.id === 'nama' || f.label.toLowerCase().includes('nama'));
  const safeBase = sanitizeSlug(baseFileName.replace(/\.(xlsx|csv)$/i, ''));

  if (format === 'pdf_merged') {
    const pdf = new jsPDF({
      orientation: isPortrait ? 'portrait' : 'landscape',
      unit: 'pt',
      format: 'a4',
    });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < rows.length; i++) {
      const dataUrl = await renderCertificateToDataUrl({
        template,
        row: rows[i],
        rowIndex: i,
        mapping,
        overrides: overridesByRow[i],
        numberPrefix,
        cachedBgImage: cachedBg,
      });
      if (i > 0) pdf.addPage();
      pdf.addImage(dataUrl, 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');

      // Also prepare individual PDF base64 for first 50 rows if emailing
      if (i < 50) {
        const singlePdf = new jsPDF({
          orientation: isPortrait ? 'portrait' : 'landscape',
          unit: 'pt',
          format: 'a4',
        });
        singlePdf.addImage(dataUrl, 'PNG', 0, 0, singlePdf.internal.pageSize.getWidth(), singlePdf.internal.pageSize.getHeight(), undefined, 'FAST');
        const recipientName = nameField
          ? resolveFieldText({ field: nameField, row: rows[i], rowIndex: i, mapping, overrides: overridesByRow[i], numberPrefix })
          : `Peserta-${i + 1}`;
        const dataUri = singlePdf.output('datauristring');
        emailAttachments.push({
          index: i,
          name: recipientName,
          base64Pdf: dataUri.split(',')[1] || '',
          fileName: `${String(i + 1).padStart(3, '0')}-${sanitizeSlug(recipientName)}.pdf`,
        });
      }

      onProgress?.(i + 1, rows.length);
    }

    const blob = pdf.output('blob');
    triggerBlobDownload(blob, `${safeBase}-autoserti-gabungan.pdf`);
    return emailAttachments;
  }

  const zip = new JSZip();
  for (let i = 0; i < rows.length; i++) {
    const dataUrl = await renderCertificateToDataUrl({
      template,
      row: rows[i],
      rowIndex: i,
      mapping,
      overrides: overridesByRow[i],
      numberPrefix,
      cachedBgImage: cachedBg,
    });
    const recipientName = nameField
      ? resolveFieldText({ field: nameField, row: rows[i], rowIndex: i, mapping, overrides: overridesByRow[i], numberPrefix })
      : `Peserta-${i + 1}`;
    const slug = `${String(i + 1).padStart(3, '0')}-${sanitizeSlug(recipientName)}`;

    if (format === 'png_zip') {
      const base64Png = dataUrl.split(',')[1];
      zip.file(`${slug}.png`, base64Png, { base64: true });
      if (i < 50) {
        const singlePdf = new jsPDF({
          orientation: isPortrait ? 'portrait' : 'landscape',
          unit: 'pt',
          format: 'a4',
        });
        singlePdf.addImage(dataUrl, 'PNG', 0, 0, singlePdf.internal.pageSize.getWidth(), singlePdf.internal.pageSize.getHeight(), undefined, 'FAST');
        emailAttachments.push({
          index: i,
          name: recipientName,
          base64Pdf: singlePdf.output('datauristring').split(',')[1] || '',
          fileName: `${slug}.pdf`,
        });
      }
    } else {
      const singlePdf = new jsPDF({
        orientation: isPortrait ? 'portrait' : 'landscape',
        unit: 'pt',
        format: 'a4',
      });
      singlePdf.addImage(dataUrl, 'PNG', 0, 0, singlePdf.internal.pageSize.getWidth(), singlePdf.internal.pageSize.getHeight(), undefined, 'FAST');
      const pdfBytes = singlePdf.output('arraybuffer');
      zip.file(`${slug}.pdf`, pdfBytes);
      if (i < 50) {
        emailAttachments.push({
          index: i,
          name: recipientName,
          base64Pdf: singlePdf.output('datauristring').split(',')[1] || '',
          fileName: `${slug}.pdf`,
        });
      }
    }

    onProgress?.(i + 1, rows.length);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerBlobDownload(zipBlob, `${safeBase}-autoserti-${format === 'png_zip' ? 'png' : 'pdf'}.zip`);
  return emailAttachments;
}

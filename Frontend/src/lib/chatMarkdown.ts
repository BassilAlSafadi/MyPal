const BR_TAG_RE = /(?:<br\s*\/?>|&lt;br\s*\/?&gt;)/gi;
const TAG_RE = /<\/?[a-z][^>]*>/gi;

export function normalizeChatMarkdown(content: string): string {
  let text = content || '';

  text = decodeHtmlEntities(text);
  text = htmlTablesToMobileMarkdown(text);
  text = markdownTablesToMobileMarkdown(text);

  text = text
    .replace(BR_TAG_RE, '\n')
    .replace(/<\/(p|div|section|article|h[1-6])>/gi, '\n\n')
    .replace(/<(p|div|section|article|h[1-6])[^>]*>/gi, '')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/?(ul|ol)>/gi, '\n')
    .replace(/<(strong|b)>/gi, '**')
    .replace(/<\/(strong|b)>/gi, '**')
    .replace(/<(em|i)>/gi, '*')
    .replace(/<\/(em|i)>/gi, '*')
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(TAG_RE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

function isMarkdownTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes('|') && trimmed.replace(/\\\|/g, '').split('|').length >= 3;
}

function isMarkdownSeparatorLine(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function markdownTablesToMobileMarkdown(text: string): string {
  const lines = text.split('\n');
  const output: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1] || '';

    if (isMarkdownTableLine(line) && isMarkdownSeparatorLine(next)) {
      const tableLines = [line, next];
      i += 2;
      while (i < lines.length && isMarkdownTableLine(lines[i])) {
        tableLines.push(lines[i]);
        i += 1;
      }
      i -= 1;

      output.push(tableRowsToMobileMarkdown(
        splitMarkdownRow(tableLines[0]),
        tableLines.slice(2).map(splitMarkdownRow),
      ));
      continue;
    }

    output.push(line);
  }

  return output.join('\n');
}

function htmlTablesToMobileMarkdown(text: string): string {
  if (!/<table[\s\S]*?<\/table>/i.test(text) || typeof DOMParser === 'undefined') {
    return text;
  }

  return text.replace(/<table[\s\S]*?<\/table>/gi, (tableHtml) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(tableHtml, 'text/html');
    const rowElements = Array.from(doc.querySelectorAll('tr'));
    const rows = rowElements
      .map((row) => Array.from(row.querySelectorAll('th,td')).map((cell) => tableCellMarkdown(cell)))
      .filter((row) => row.length > 0);

    if (rows.length === 0) return '';

    const firstRowHasHeader = rowElements[0]?.querySelectorAll('th').length > 0;
    const width = Math.max(...rows.map((row) => row.length));
    const header = firstRowHasHeader
      ? padRow(rows[0], width)
      : Array.from({ length: width }, (_, index) => `Column ${index + 1}`);
    const bodyRows = firstRowHasHeader ? rows.slice(1) : rows;

    return tableRowsToMobileMarkdown(header, bodyRows);
  });
}

function tableRowsToMobileMarkdown(headers: string[], rows: string[][]): string {
  const cleanedHeaders = headers.map(cleanTableCell).filter(Boolean);
  if (cleanedHeaders.length === 0 || rows.length === 0) return '';

  const width = cleanedHeaders.length;
  const sections = rows
    .map((row, index) => rowToMobileMarkdown(cleanedHeaders, padRow(row, width).map(cleanTableCell), index))
    .filter(Boolean);

  return sections.length ? `\n${sections.join('\n\n')}\n` : '';
}

function rowToMobileMarkdown(headers: string[], cells: string[], index: number): string {
  const titleIndexes = titleColumnIndexes(headers, cells);
  const titleParts = titleIndexes.map((i) => cells[i]).filter(Boolean);
  const title = titleParts.length > 0 ? titleParts.join('. ') : `Option ${index + 1}`;

  const details = cells
    .map((cell, cellIndex) => ({ cell, header: headers[cellIndex] || `Detail ${cellIndex + 1}`, cellIndex }))
    .filter(({ cell, cellIndex }) => cell && !titleIndexes.includes(cellIndex))
    .map(({ header, cell }) => `- **${header}:** ${cell}`);

  return [`**${title}**`, ...details].join('\n');
}

function titleColumnIndexes(headers: string[], cells: string[]): number[] {
  const firstHeader = normalizeHeader(headers[0]);
  const firstCell = cells[0] || '';
  const secondCell = cells[1] || '';
  const firstIsRank = ['#', 'no', 'number', 'rank', 'id'].includes(firstHeader) || /^\d+\.?$/.test(firstCell);

  if (firstIsRank && secondCell) return [0, 1];
  if (firstCell) return [0];
  if (secondCell) return [1];
  return [];
}

function normalizeHeader(value: string): string {
  return value.replace(/[*_`]/g, '').trim().toLowerCase().replace(/\.$/, '');
}

function splitMarkdownRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let current = '';
  let escaped = false;

  for (const char of trimmed) {
    if (char === '|' && !escaped) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
    escaped = char === '\\' && !escaped;
    if (char !== '\\') escaped = false;
  }

  cells.push(current);
  return cells;
}

function tableCellMarkdown(cell: Element): string {
  return htmlFragmentToMarkdownCell(cell.innerHTML || cell.textContent || '');
}

function htmlFragmentToMarkdownCell(value: string): string {
  return value
    .replace(BR_TAG_RE, ', ')
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(TAG_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTableCell(value: string): string {
  return decodeHtmlEntities(value)
    .replace(BR_TAG_RE, ', ')
    .replace(TAG_RE, '')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

function padRow(row: string[], width: number): string[] {
  return [...row, ...Array(Math.max(0, width - row.length)).fill('')];
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&mdash;/gi, '-')
    .replace(/&ndash;/gi, '-')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

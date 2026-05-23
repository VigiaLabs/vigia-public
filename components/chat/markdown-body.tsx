'use client';

import React from 'react';

type Source = { id: string; label: string; trustLevel: string; url?: string };

export function MarkdownBody({ text, sources }: { text: string; sources?: Source[] }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Heading
    if (line.match(/^#{1,3}\s/)) {
      const level = line.match(/^#+/)?.[0].length ?? 2;
      const content = line.replace(/^#{1,3}\s+/, '');
      elements.push(
        <h3 key={i} className={level <= 2 ? 'mt-5 mb-2 text-[15px] font-semibold text-text-primary' : 'mt-3 mb-1.5 text-[14px] font-semibold text-text-primary'}>
          {renderInline(content, sources)}
        </h3>
      );
      i++;
      continue;
    }

    // Numbered list (1. item, 2. item)
    if (line.match(/^\s*\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\s*\d+\.\s/)) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="my-2 space-y-2 pl-0 list-none">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2.5 text-[14.5px] leading-relaxed text-text-primary">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f0f0f2] text-[11px] font-medium text-text-muted">{j + 1}</span>
              <span className="flex-1">{renderInline(item, sources)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Bullet list (- item, • item, * item)
    if (line.match(/^\s*[-•*]\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\s*[-•*]\s/)) {
        items.push(lines[i].replace(/^\s*[-•*]\s+/, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="my-2 space-y-1.5 pl-0">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2 text-[14.5px] leading-relaxed text-text-primary">
              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#c4c4c8]" />
              <span className="flex-1">{renderInline(item, sources)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Table (| col | col |)
    if (line.match(/^\|.+\|/)) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].match(/^\|.+\|/)) {
        const cells = lines[i].split('|').slice(1, -1).map(c => c.trim());
        // Skip separator rows (|---|---|)
        if (!cells.every(c => /^[-:\s]+$/.test(c))) {
          rows.push(cells);
        }
        i++;
      }
      if (rows.length > 0) {
        const header = rows[0];
        const body = rows.slice(1);
        elements.push(
          <div key={`table-${i}`} className="my-3 overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border/60 bg-[#fafafa]">
                  {header.map((cell, j) => (
                    <th key={j} className="px-3 py-2 text-left font-medium text-text-secondary">{renderInline(cell, sources)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, j) => (
                  <tr key={j} className="border-b border-border/30 last:border-0">
                    {row.map((cell, k) => (
                      <td key={k} className="px-3 py-2 text-text-primary">{renderInline(cell, sources)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // Empty line
    if (!line.trim()) {
      elements.push(<div key={`br-${i}`} className="h-2.5" />);
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="text-[14.5px] leading-relaxed text-text-primary">
        {renderInline(line, sources)}
      </p>
    );
    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

function renderInline(text: string, sources?: Source[]): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(\*\*(.+?)\*\*)|(\[([^\]]+)\]\(([^)]+)\))|(\[Source:\s*([^\]]+)\])/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // **bold**
      parts.push(<strong key={key++} className="font-semibold text-text-primary">{match[2]}</strong>);
    } else if (match[3]) {
      // [text](url)
      parts.push(
        <a key={key++} href={match[5]} target="_blank" rel="noopener noreferrer" className="text-[#2563eb] underline decoration-[#2563eb]/30 underline-offset-2 hover:decoration-[#2563eb]">
          {match[4]}
        </a>
      );
    } else if (match[6]) {
      // [Source: Label]
      const label = match[7].trim();
      const source = sources?.find(s => s.label === label || label.includes(s.label));
      const citationNum = sources ? (sources.findIndex(s => s.label === label || label.includes(s.label)) + 1) || '•' : '•';
      parts.push(
        <a
          key={key++}
          href={source?.url}
          target="_blank"
          rel="noopener noreferrer"
          title={`${label} (${source?.trustLevel ?? 'source'})`}
          className="mx-0.5 inline-flex items-center rounded bg-[#f0f0f2] px-1.5 py-0.5 align-baseline text-[11px] font-medium text-text-muted no-underline transition-colors hover:bg-[#e4e4e7] hover:text-text-secondary"
        >
          {citationNum}
        </a>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length ? parts : [text];
}

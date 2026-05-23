'use client';

import React from 'react';
import { CitationChip } from './citation-chip';
import { dedupeSources, findSourceByLabel, type VigiaSource } from '@/lib/sources/utils';

export function MarkdownBody({
  text,
  sources,
  isStreaming,
  onOpenSource,
}: {
  text: string;
  sources?: VigiaSource[];
  isStreaming?: boolean;
  onOpenSource?: (sourceId: string) => void;
}) {
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
        <h3
          key={i}
          className={
            level <= 2
              ? 'shell-answer-heading mt-5 mb-2 text-[16px]'
              : 'shell-answer-heading mt-3 mb-1.5 text-[15px]'
          }
        >
          {renderInline(content, sources, onOpenSource)}
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
        <ol key={`ol-${i}`} className="my-2.5 space-y-2.5 pl-0 list-none">
          {items.map((item, j) => (
            <li key={j} className="shell-answer-list-item flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f0f0f2] font-sans text-[11px] font-medium text-text-muted">
                {j + 1}
              </span>
              <span className="flex-1">{renderInline(item, sources, onOpenSource)}</span>
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
        <ul key={`ul-${i}`} className="my-2.5 space-y-2 pl-0">
          {items.map((item, j) => (
            <li key={j} className="shell-answer-list-item flex items-start gap-2.5">
              <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#a1a1aa]" />
              <span className="flex-1">{renderInline(item, sources, onOpenSource)}</span>
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
          <div key={`table-${i}`} className="shell-answer-table my-4 overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/60 bg-[#fafafa]">
                  {header.map((cell, j) => (
                    <th key={j} className="px-3 py-2 text-left font-medium text-text-secondary">
                      {renderInline(cell, sources, onOpenSource)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, j) => (
                  <tr key={j} className="border-b border-border/30 last:border-0">
                    {row.map((cell, k) => (
                      <td key={k} className="px-3 py-2 text-text-primary">
                        {renderInline(cell, sources, onOpenSource)}
                      </td>
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
      elements.push(<div key={`br-${i}`} className="h-2" />);
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="shell-answer-paragraph">
        {renderInline(line, sources, onOpenSource)}
      </p>
    );
    i++;
  }

  return (
    <div className="relative">
      <div className="space-y-1">{elements}</div>
      {isStreaming && (
        <span className="shell-stream-cursor" aria-hidden />
      )}
    </div>
  );
}

function renderInline(
  text: string,
  sources?: VigiaSource[],
  onOpenSource?: (sourceId: string) => void
): React.ReactNode[] {
  const list = sources ? dedupeSources(sources) : [];
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
      parts.push(<strong key={key++} className="font-semibold text-text-primary">{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(
        <a
          key={key++}
          href={match[5]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-sans text-[14px] text-[#2563eb] underline decoration-[#2563eb]/30 underline-offset-2 hover:decoration-[#2563eb]"
        >
          {match[4]}
        </a>
      );
    } else if (match[6]) {
      const label = match[7].trim();
      const source = findSourceByLabel(list, label);
      const displayIndex = source
        ? list.findIndex((item) => item.id === source.id) + 1
        : list.length + 1;

      parts.push(
        <CitationChip
          key={key++}
          index={displayIndex > 0 ? displayIndex : 1}
          sourceId={source?.id}
          url={source?.url}
          onOpenSource={onOpenSource}
        />
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length ? parts : [text];
}

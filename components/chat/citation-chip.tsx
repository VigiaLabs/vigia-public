'use client';

import React from 'react';

type Source = { id: string; label: string; trustLevel: string; url?: string };

type CitationChipProps = {
  index: number;
  label: string;
  trustLevel: string;
  url?: string;
};

function CitationChip({ index, label, trustLevel, url }: CitationChipProps) {
  const chip = (
    <span
      title={`${label} (${trustLevel})`}
      className="mx-0.5 inline-flex cursor-default items-center rounded bg-[#f0f0f2] px-1.5 py-0.5 align-baseline text-[11px] font-medium text-text-muted transition-colors hover:bg-[#e4e4e7] hover:text-text-secondary"
    >
      {index}
    </span>
  );

  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="no-underline">
        {chip}
      </a>
    );
  }
  return chip;
}

/**
 * Parses raw text containing markdown-style citations like:
 *   [Source: NHAI Awarded Projects PDF]
 *   [Source: NHAI Awarded Projects - https://...]
 * and replaces them with numbered CitationChip components.
 */
export function parseCitations(
  text: string,
  sources: Source[]
): React.ReactNode[] {
  // Match patterns like [Source: Label] or [Source: Label - URL]
  const pattern = /\[Source:\s*([^\]\-]+?)(?:\s*-\s*(https?:\/\/[^\]]+))?\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let citationIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    citationIndex++;
    const matchedLabel = match[1].trim();
    const matchedUrl = match[2]?.trim();

    // Try to find matching source from metadata
    const source = sources.find(
      (s) => s.label === matchedLabel || s.url === matchedUrl
    );

    parts.push(
      <CitationChip
        key={`cite-${match.index}`}
        index={citationIndex}
        label={source?.label ?? matchedLabel}
        trustLevel={source?.trustLevel ?? 'unknown'}
        url={source?.url ?? matchedUrl}
      />
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length ? parts : [text];
}

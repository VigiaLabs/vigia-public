'use client';

import React from 'react';
import { findSourceByLabel, type VigiaSource } from '@/lib/sources/utils';

type Props = {
  index: number;
  sourceId?: string;
  url?: string;
  onOpenSource?: (sourceId: string) => void;
};

/** Minimal inline citation — superscript number, no popover chrome. */
export function CitationChip({ index, sourceId, url, onOpenSource }: Props) {
  function handleClick(e: React.MouseEvent) {
    if (onOpenSource && sourceId) {
      e.preventDefault();
      onOpenSource(sourceId);
    } else if (!url) {
      e.preventDefault();
    }
  }

  const mark = (
    <sup className="mx-px inline-block not-italic">
      <span className="cite-mark">{index}</span>
    </sup>
  );

  if (onOpenSource && sourceId) {
    return (
      <button type="button" className="cite-btn" onClick={handleClick} aria-label={`Source ${index}`}>
        {mark}
      </button>
    );
  }

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="cite-btn no-underline"
        onClick={handleClick}
        aria-label={`Source ${index}`}
      >
        {mark}
      </a>
    );
  }

  return mark;
}

export function parseCitations(
  text: string,
  sources: VigiaSource[],
  onOpenSource?: (sourceId: string) => void
): React.ReactNode[] {
  const pattern = /\[Source:\s*([^\]\-]+?)(?:\s*-\s*(https?:\/\/[^\]]+))?\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));

    const label = match[1].trim();
    const url = match[2]?.trim();
    const source = findSourceByLabel(sources, label);
    const index = source
      ? sources.findIndex((s) => s.id === source.id) + 1
      : parts.filter((p) => typeof p !== 'string').length + 1;

    parts.push(
      <CitationChip
        key={`cite-${match.index}`}
        index={index > 0 ? index : 1}
        sourceId={source?.id}
        url={source?.url ?? url}
        onOpenSource={onOpenSource}
      />
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length ? parts : [text];
}

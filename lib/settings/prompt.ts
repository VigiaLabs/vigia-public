import type { ResponseStyle } from './types';

export function buildResponseStylePrompt(style: ResponseStyle): string {
  switch (style) {
    case 'concise':
      return [
        '\n\n## Response style',
        'Be concise. Use short paragraphs and bullet points where helpful.',
        'Skip preamble and get to the answer quickly.',
      ].join('\n');
    case 'detailed':
      return [
        '\n\n## Response style',
        'Provide thorough explanations with context, caveats, and relevant procedural steps.',
        'Include enough detail for an informed decision.',
      ].join('\n');
    case 'citizen-friendly':
      return [
        '\n\n## Response style',
        'Write for a citizen with no technical background.',
        'Use plain language, explain acronyms, and include actionable next steps.',
      ].join('\n');
  }
}

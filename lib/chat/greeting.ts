/** Time-aware landing greeting — professional, Gemini-style empty state copy. */
export function getLandingGreeting(): { headline: string; subline: string } {
  const hour = new Date().getHours();

  let timeGreeting: string;
  if (hour < 12) timeGreeting = 'Good morning';
  else if (hour < 17) timeGreeting = 'Good afternoon';
  else timeGreeting = 'Good evening';

  return {
    headline: `${timeGreeting}. Let's get started.`,
    subline: 'What infrastructure question can I help with today?',
  };
}

export const LANDING_SUGGESTIONS = [
  'Draft an infrastructure brief',
  'Review budget allocation',
  'Query spatial records',
] as const;

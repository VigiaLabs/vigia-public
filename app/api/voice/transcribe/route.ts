import { transcribeAudioRequest } from '@/lib/voice/transcribe-handler';

export const runtime = 'nodejs';

export const POST = transcribeAudioRequest;

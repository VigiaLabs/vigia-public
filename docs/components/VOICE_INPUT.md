# VoiceInput Component Documentation

## Overview

`VoiceInput` is a professional, enterprise-grade voice input component that implements push-to-talk functionality using the browser's native MediaRecorder API. Users hold down the microphone button to record audio, and release to stop recording and submit.

## Features

- **Push-to-Talk**: Hold-to-record mechanism with visual feedback
- **Graceful Permission Handling**: Elegant microphone permission requests with user-friendly error messages
- **Visual Recording State**: Pulsing red indicator while recording
- **Audio Processing**: Converts recorded audio to WebM Blob format
- **Touch & Mouse Support**: Works with both mouse and touch interactions
- **Accessibility**: ARIA labels, semantic button structure
- **Error Handling**: Comprehensive error messaging for permission and recording failures
- **Resource Cleanup**: Properly stops media streams on component unmount
- **Enterprise Styling**: Minimal, professional UI that integrates seamlessly with the app

## Props

```typescript
type VoiceInputProps = {
  onAudioCapture: (blob: Blob) => Promise<void> | void;
  isDisabled?: boolean;
};
```

### `onAudioCapture`
- **Type**: `(blob: Blob) => Promise<void> | void`
- **Required**: Yes
- **Description**: Callback function that receives the recorded audio blob. The blob is in `audio/webm` format. This function is called when the user releases the microphone button after recording.

### `isDisabled`
- **Type**: `boolean`
- **Default**: `false`
- **Required**: No
- **Description**: When true, disables the voice input button and prevents recording. Useful when the parent component is in a loading or processing state.

## Usage Example

```tsx
import { VoiceInput } from '@/components/chat/voice-input';

export function ChatInput() {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAudioCapture = async (blob: Blob) => {
    setIsProcessing(true);
    try {
      // Process the audio blob (e.g., send to API for transcription)
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');
      
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });
      
      const { text } = await response.json();
      // Update input field or trigger submission
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <VoiceInput 
      onAudioCapture={handleAudioCapture}
      isDisabled={isProcessing}
    />
  );
}
```

## Technical Implementation

### Recording Flow

1. **Microphone Request**: On first click, component requests microphone access via `getUserMedia()`
2. **Stream Caching**: Stream is cached for reuse without re-requesting permission
3. **Recording**: MediaRecorder starts collecting audio chunks in WebM format
4. **Data Collection**: `ondataavailable` event collects audio data chunks
5. **Blob Creation**: On release, chunks are combined into a single Blob
6. **Callback**: Audio blob is passed to `onAudioCapture` callback

### Audio Constraints

The component requests audio with these enhancements:
- **Echo Cancellation**: Reduces echo from speakers
- **Noise Suppression**: Reduces background noise
- **Auto Gain Control**: Normalizes volume levels

### Media Format

- **MIME Type**: `audio/webm`
- **Codec**: VP8/VP9 video (if available) + Opus audio
- **Browser Support**: Chrome, Edge, Firefox, Safari 14.1+

## Visual States

| State | Appearance | Interaction |
|-------|-----------|-------------|
| Idle | Gray microphone icon | Clickable, hover changes color |
| Recording | Pulsing red background with red icon | Button is "locked" during recording |
| Loading | Disabled state | Cannot interact |
| Permission Error | Grayed out, error text below | Disabled until permission granted |

## Error Handling

The component handles multiple error scenarios:

- **NotAllowedError**: User denies microphone permission
- **NotFoundError**: No microphone device found
- **NotReadableError**: Microphone is in use by another application
- **AbortError**: Recording was aborted
- **Processing Errors**: Gracefully catches and reports audio processing failures

All errors are displayed as friendly user messages below the microphone button.

## Accessibility Features

- **ARIA Labels**: Descriptive labels for screen readers
- **Keyboard Support**: Button is fully keyboard accessible (spacebar/enter to activate)
- **Visual Feedback**: Clear visual indication of recording state
- **Error Messages**: Text descriptions of errors for all users
- **Touch Support**: Tested on touch devices with appropriate event handlers

## Browser Support

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 49+ | ✅ Full support |
| Firefox | 25+ | ✅ Full support |
| Edge | 79+ | ✅ Full support |
| Safari | 14.1+ | ✅ Full support |
| IE 11 | - | ❌ Not supported |

## Integration with Chat Input

To integrate with the main input bar:

```tsx
import { VoiceInput } from '@/components/chat/voice-input';
import { InputBar } from '@/components/chat/input-bar';

export function ChatInterface() {
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAudioCapture = async (blob: Blob) => {
    setIsProcessing(true);
    try {
      // Transcribe audio to text
      const text = await transcribeAudio(blob);
      setInput(text);
      // Optionally auto-submit
      handleSubmit(text);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex gap-2">
      <VoiceInput 
        onAudioCapture={handleAudioCapture}
        isDisabled={isProcessing}
      />
      <InputBar 
        value={input}
        onChange={setInput}
        onSubmit={() => handleSubmit(input)}
        isSending={isProcessing}
      />
    </div>
  );
}
```

## Performance Considerations

- **Memory**: Audio chunks are stored in memory during recording. For long recordings (>30s), consider implementing streaming to reduce memory footprint
- **CPU**: WebM encoding is handled by the browser's native codec
- **Network**: Audio blobs should be compressed or transcribed server-side before storage

## Security Notes

- Microphone access requires HTTPS in production (except localhost)
- Audio data is only stored locally until explicitly sent to a server
- Always validate and sanitize transcribed text on the server side
- Implement rate limiting on audio processing endpoints

## Styling & Theming

The component uses Tailwind CSS classes and is designed to work with the app's existing design system. Key classes:
- Button size: `h-8 w-8` (32px)
- Microphone icon: `h-4 w-4` (16px)
- Recording pulse: Red color with opacity animation
- Error text: Red-600 color

To customize, modify the Tailwind classes in the component directly.

## Known Limitations

1. **Audio Duration**: Consider implementing server-side duration limits for long recordings
2. **Background Tabs**: Recording continues if tab loses focus (browser default behavior)
3. **Multiple Instances**: Only one component can record at a time (browser limitation)
4. **Format**: Currently supports only WebM format; adding other formats requires codec configuration

## Future Enhancements

- Real-time volume visualization during recording
- Waveform display
- Support for multiple audio formats (MP3, WAV)
- Local audio compression before upload
- Voice activity detection for auto-submit
- Recording duration timer

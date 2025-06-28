// import {AppServer, AppSession, StreamType} from '@mentra/sdk';
import {TpaServer, TpaSession, StreamType} from '@augmentos/sdk'
import {PitchDetector} from 'pitchy'
import logger from './utils/logger'
import {config} from './config/environment';

class PitchTuner extends TpaServer {
    private activeUserSessions = new Map<string, {session: TpaSession, sessionId: string}>();

    constructor() {
        super({
            packageName: config.augmentOS.packageName,
            apiKey: config.augmentOS.apiKey,
            port: config.server.port,
        });
        // Set up express server for auth callback
        const app = this.getExpressApp();
    };

  // Called when new user connects to app
  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    console.log(`New session started: ${sessionId} for user: ${userId}`);

    const detector = PitchDetector.forFloat32Array(2048);
    const audioBuffer = new Float32Array(2048);
    let bufferOffset = 0;

    session.subscribe(StreamType.AUDIO_CHUNK);
    const audioCleanup = session.events.onAudioChunk((data) => {
      const sr = data.sampleRate ?? 16000;
      const floatChunk = new Int32Array(data.arrayBuffer);

      let idx = 0;
      while (idx < floatChunk.length) {
        const remaining = 2048 - bufferOffset;
        const toCopy = Math.min(remaining, floatChunk.length - idx);
        audioBuffer.set(floatChunk.subarray(idx, idx + toCopy), bufferOffset);
        bufferOffset += toCopy;
        idx += toCopy;

        if (bufferOffset === 2048) {
          const [pitch, clarity] = detector.findPitch(audioBuffer, sr);
          if (pitch && clarity > .8) {
            const note = this.frequencyToNote(pitch);
            if (!note.includes('undefined') || !note.includes('-')) {
              logger.info(note);
              session.layouts.showTextWall(note, {durationMs: 5000});
            }
          }
          bufferOffset = 0;
        }
      }
    });
    this.addCleanupHandler(audioCleanup);

    // Register cleanup handlers
    this.addCleanupHandler(() => this.activeUserSessions.delete(userId));
  }

  protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
    await super.onStop(sessionId, userId, reason);
    logger.info(`[User ${userId}] Received cleanup complete notification for session ${sessionId}.`);
    // Verify if the session being cleaned up is still the one we are tracking
    const trackedInfo = this.activeUserSessions.get(userId);
    if (trackedInfo && trackedInfo.sessionId === sessionId) {
      logger.info(`[User ${userId}] Removing session ${sessionId} from active tracking map.`);
      this.activeUserSessions.delete(userId);
    } else {
      logger.warn(`[User ${userId}] Cleanup complete notification for session ${sessionId}, but different session ${trackedInfo?.sessionId ?? 'none'} is tracked or user already removed.`);
    }
  }

  protected frequencyToNote(freq: number): string {
    console.log(freq);
    const A4 = 440;
    const noteName = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'];
    const semitone = 12 * Math.log2(freq / A4);
    const noteIndex = Math.round(semitone) + 9;
    const octave = Math.floor(((Math.round(semitone) + 69) / 12) - 2) //Actually find the correct math or fix the frequency coming in 1 octave to high
    const note = noteName[(noteIndex + 12) % 12];
    return `${note}${octave}`;
  }
}

const tpa = new PitchTuner();

tpa.start().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
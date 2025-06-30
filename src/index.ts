// import {AppServer, AppSession, StreamType} from '@mentra/sdk';
import {TpaServer, TpaSession, StreamType} from '@augmentos/sdk'
import {PitchDetector} from 'pitchy'
import logger from './utils/logger'
import {config} from './config/environment';

const defaultSettings = {
  tuning: 'free_tuning'
};

const userTuning: Map<string, string> = new Map();

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
    logger.info(`New session started: ${sessionId} for user: ${userId}`);

    this.activeUserSessions.set(userId, {session, sessionId});
    userTuning.set(userId, defaultSettings.tuning)

    try {
      this.setupSettingsHandlers(session, sessionId, userId);
      await this.applySettings(session, sessionId, userId);
    } catch (error) {
      logger.error(`Error initializing settings for user ${userId}.`, {
        userId: userId,
        error: {
          message: error.message,
          stack: error.stack,
          responseStatus: error.response?.status,
          responseBody: error.response?.data 
        }
      });
    }

    const detector = PitchDetector.forFloat32Array(2048);
    const audioBuffer = new Float32Array(2048);
    let bufferOffset = 0;
    var i = 0;

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
            if (!note.includes('undefined') && !note.includes('-')) {
              logger.debug(`Note: ${note}, Index: ${i}`);
              switch (userTuning.get(userId)) {
                case 'free_tuning':
                  session.layouts.showTextWall(`🎶 ${note}`, {durationMs: 5000});
                  break;

                case 'basic_tuning':
                  i = this.specificTuning(session, note, 'EADGBE', i);
                  break;

                case 'drop_d_tuning':
                  i = this.specificTuning(session, note, 'DADGBE', i);
                  break;

                default:
                  logger.warn('Unknown tuning.');
                  break;
              }
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
    logger.debug(freq);
    const A4 = 440;
    const noteName = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'];
    const semitone = 12 * Math.log2(freq / A4);
    const noteIndex = Math.round(semitone) + 9;
    const octave = Math.floor(((Math.round(semitone) + 69) / 12) - 2) //Actually find the correct math or fix the frequency coming in 1 octave to high
    const note = noteName[(noteIndex + 12) % 12];
    return `${note}${octave}`;
  }

  protected specificTuning(session: TpaSession, note: string, tuning: string, i: number): number {
    if (note[0] === tuning[i] && i < 5) {
      session.layouts.showTextWall(`🎶 Perfect! Move to the next string ${tuning[i+1]}.`, {durationMs: 5000});
      i++;
    } if (note[0] === tuning[i] && i === 5) {
      session.layouts.showTextWall(`🎶 Perfect! All strings tuned.`, {durationMs: 5000});
      i++;
    } if (i >= 6) {
      session.layouts.showTextWall(`🎶 All strings tuned. Restarting tuning or switch tuning to free tuning in settings.`, {durationMs: 5000});
      i = 0;
    } else {
      session.layouts.showTextWall(`🎶 ${note[0]} -> ${tuning[i]}`, {durationMs: 5000});
    }

    return i;
  }

  private setupSettingsHandlers(session: TpaSession, sessionId: string, userId: string): void {
    session.settings.onValueChange('tuning', (newValue, oldValue) => {
      logger.info(`Tuning type changed for user ${userId}: ${oldValue} -> ${newValue}`);
      this.applySettings(session, sessionId, userId);
    });
  }

  private async applySettings(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    try {
      const tuningType = session.settings.get<string>('tuning', defaultSettings.tuning);
      userTuning.set(userId, tuningType);
      logger.info(`[Session ${sessionId}]: tuning=${tuningType}`);
    } catch (error) {
      logger.error(`Error fetching settings for user ${userId}.`, {
        userId: userId,
        error: {
          message: error.message,
          stack: error.stack,
          responseStatus: error.response?.status,
          responseBody: error.response?.data 
        }
      });
      throw error;
    }
  }
}

const tpa = new PitchTuner();

tpa.start().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
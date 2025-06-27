import {AppServer, AppSession} from '@mentra/sdk';
import path from 'path';
import express from 'express';

const PACKAGE_NAME = process.env.PACKAGE_NAME ?? (() => { throw new Error('PACKAGE_NAME is not set in .env file'); })();
const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY ?? (() => { throw new Error('MENTRAOS_API_KEY is not set in .env file'); })();
const PORT = parseInt(process.env.PORT || '3000');

class PitchTuner extends AppServer {
    private userTokens = new Map<string, AppSession>();

    constructor() {
        super({
            packageName: PACKAGE_NAME,
            apiKey: MENTRAOS_API_KEY,
            port: PORT,
        });
        // Set up express server for auth callback
        const app = this.getExpressApp();
    };

  // Called when new user connects to app
  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    console.log(`New session started: ${sessionId} for user: ${userId}`);

    session.subscribe(StreamType.AUDIO_CHUNK);
    session.events.onAudioChunk((data) => {

    });

    // Register cleanup handlers
    this.addCleanupHandler(() => this.userTokens.delete(userId));
  }
}

const tpa = new PitchTuner();

tpa.start().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
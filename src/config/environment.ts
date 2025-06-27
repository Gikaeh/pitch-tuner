import dotenv from 'dotenv';

// Load env variables
dotenv.config();

export const config = {
  server: {
    port: process.env.PORT || 4040,
  },
  augmentOS: {
    apiKey: process.env.MENTRAOS_API_KEY ?? (() => { throw new Error('MENTRAOS_API_KEY is not set in .env file'); })(),
    packageName: process.env.PACKAGE_NAME ?? (() => { throw new Error('PACKAGE_NAME is not set in .env file'); })()
  },
  logging: {
    appState: process.env.NODE_ENV
  }
};

// Log environment configuration
export function logEnvironment() {
  console.log('=== Environment Variables ===');
  console.log(`PORT: ${config.server.port}`);
  console.log(`PACKAGE_NAME: ${config.augmentOS.packageName}`);
  console.log(`MENTRAOS_API_KEY: ${config.augmentOS.apiKey ? 'Set' : 'Not set'}`);
}
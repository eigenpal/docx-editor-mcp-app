/** Keep the existing command as the ChatGPT local submission builder. */
process.argv[2] = 'chatgpt';
await import('./build-local-packages.mjs');

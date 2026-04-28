import { logger } from './lib/logger';
import { facebookWorker } from './workers/facebook.worker';
import { instagramWorker } from './workers/instagram.worker';
import { whatsappWorker } from './workers/whatsapp.worker';

async function runWorkers() {
  logger.info('Starting Social Dispatcher workers...');

  try {
    // Workers run in background
    logger.info('Facebook worker started');
    logger.info('Instagram worker started');
    logger.info('WhatsApp worker started');

    // Keep process alive
    process.on('SIGINT', async () => {
      logger.info('Shutting down workers...');
      await facebookWorker.close();
      await instagramWorker.close();
      await whatsappWorker.close();
      process.exit(0);
    });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Worker startup error');
    process.exit(1);
  }
}

runWorkers().catch((err) => {
  logger.error({ error: err.message }, 'Fatal error');
  process.exit(1);
});

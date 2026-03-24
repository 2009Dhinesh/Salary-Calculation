const { Worker } = require('bullmq');
const { updateMetalRates } = require('../controllers/metalController');
const { redisConnection } = require('../config/queue');

const worker = new Worker('metal-rates', async (job) => {
  if (job.name === 'update-rates') {
    console.log('👷 Worker: Updating metal rates...');
    const force = job.data?.force || false;
    await updateMetalRates(force);
    console.log('👷 Worker: Metal rates updated successfully.');
  }
}, { connection: redisConnection });

// Silence noise if Redis is down
worker.on('error', () => {});

worker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed!`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed with error: ${err.message}`);
});

console.log('🚀 Metal Worker started and waiting for jobs...');

module.exports = worker;

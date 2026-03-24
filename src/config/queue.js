const { Queue } = require('bullmq');
const redisConnection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 0,
  enableReadyCheck: false,
  lazyConnect: true,
};

const metalQueue = new Queue('metal-rates', { connection: redisConnection });

// Silence noise if Redis is down
metalQueue.on('error', () => {});

module.exports = {
  metalQueue,
  redisConnection
};

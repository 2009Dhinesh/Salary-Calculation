const Redis = require('ioredis');

const redisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: true, // Don't try to connect immediately
  maxRetriesPerRequest: 0, // Fail fast if Redis is down
  retryStrategy: (times) => {
    // In development, stop retrying quickly to avoid noise
    if (process.env.NODE_ENV === 'development' && times > 1) {
      return null;
    }
    const delay = Math.min(times * 500, 5000);
    return delay;
  },
};

const redis = new Redis(redisConfig);

redis.on('connect', () => {
  console.log('✅ Redis connected');
});

let errorLogged = false;
redis.on('error', () => {
  if (!errorLogged) {
    console.error('⚠️ Redis not available. Caching & Background Jobs will be disabled.');
    console.error('   Hint: Install Redis or set REDIS_HOST in .env to enable performance features.');
    errorLogged = true;
  }
  // No-op to suppress further error logs
});

module.exports = redis;

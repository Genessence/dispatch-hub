import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// Redis connection configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_ENABLED = process.env.REDIS_ENABLED !== 'false'; // Default to true

let redis: Redis | null = null;

// Initialize Redis connection
export const initRedis = () => {
  if (!REDIS_ENABLED) {
    console.log('⚠️  Redis caching is disabled (set REDIS_ENABLED=true to enable)');
    return null;
  }

  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 3) {
          console.error('❌ Redis connection failed after 3 retries');
          return null; // Stop retrying
        }
        const delay = Math.min(times * 200, 2000);
        return delay;
      },
      reconnectOnError: (err: Error) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          // Reconnect on READONLY error
          return true;
        }
        return false;
      },
    });

    redis.on('connect', () => {
      console.log('📦 Connected to Redis cache');
    });

    redis.on('error', (err: Error) => {
      console.error('❌ Redis connection error:', err.message);
      // Don't crash the app if Redis fails - gracefully degrade
    });

    redis.on('close', () => {
      console.log('🔌 Redis connection closed');
    });

    return redis;
  } catch (error: any) {
    console.error('❌ Failed to initialize Redis:', error.message);
    return null;
  }
};

// Get Redis client (returns null if not enabled or failed to connect)
export const getRedis = (): Redis | null => {
  return redis;
};

// Close Redis connection
export const closeRedis = async (): Promise<void> => {
  if (redis) {
    await redis.quit();
    redis = null;
    console.log('📦 Redis connection closed');
  }
};

// Initialize Redis on module load
initRedis();

export default redis;

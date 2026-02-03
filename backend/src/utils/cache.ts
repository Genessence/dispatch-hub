import { getRedis } from '../config/redis';

// Cache TTLs (in seconds)
export const CACHE_TTL = {
  SCHEDULE_ITEMS: 3600, // 1 hour - schedule rarely changes
  USER_PREFERENCES: 300, // 5 minutes - user preferences
  INVOICE_ITEMS: 60, // 1 minute - invoice items (shorter TTL as they update more frequently)
} as const;

// Cache key prefixes
export const CACHE_KEY = {
  SCHEDULE_BY_PART: 'schedule:part:',
  SCHEDULE_BY_DATE: 'schedule:date:',
  SCHEDULE_BY_CUSTOMER: 'schedule:customer:',
  USER_SCANNER_PREF: 'user:scanner:',
  USER_SITE_SELECTION: 'user:site:',
} as const;

/**
 * Get a value from cache
 */
export const cacheGet = async <T = any>(key: string): Promise<T | null> => {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const value = await redis.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  } catch (error: any) {
    console.warn('Cache GET error:', error.message);
    return null;
  }
};

/**
 * Set a value in cache with TTL
 */
export const cacheSet = async (key: string, value: any, ttl: number): Promise<boolean> => {
  const redis = getRedis();
  if (!redis) return false;

  try {
    await redis.setex(key, ttl, JSON.stringify(value));
    return true;
  } catch (error: any) {
    console.warn('Cache SET error:', error.message);
    return false;
  }
};

/**
 * Delete a key or keys from cache
 */
export const cacheDel = async (key: string | string[]): Promise<boolean> => {
  const redis = getRedis();
  if (!redis) return false;

  try {
    if (Array.isArray(key)) {
      await redis.del(...key);
    } else {
      await redis.del(key);
    }
    return true;
  } catch (error: any) {
    console.warn('Cache DEL error:', error.message);
    return false;
  }
};

/**
 * Delete all keys matching a pattern
 */
export const cacheDelPattern = async (pattern: string): Promise<boolean> => {
  const redis = getRedis();
  if (!redis) return false;

  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    return true;
  } catch (error: any) {
    console.warn('Cache DEL pattern error:', error.message);
    return false;
  }
};

/**
 * Check if a key exists in cache
 */
export const cacheExists = async (key: string): Promise<boolean> => {
  const redis = getRedis();
  if (!redis) return false;

  try {
    const exists = await redis.exists(key);
    return exists === 1;
  } catch (error: any) {
    console.warn('Cache EXISTS error:', error.message);
    return false;
  }
};

/**
 * Get or set a value in cache (cache-aside pattern)
 */
export const cacheGetOrSet = async <T = any>(
  key: string,
  ttl: number,
  fetchFn: () => Promise<T>
): Promise<T> => {
  // Try to get from cache first
  const cached = await cacheGet<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Cache miss - fetch from source
  const value = await fetchFn();
  
  // Store in cache (fire and forget - don't wait)
  cacheSet(key, value, ttl).catch(err => {
    console.warn('Background cache set error:', err.message);
  });

  return value;
};

/**
 * Invalidate all schedule-related caches
 */
export const invalidateScheduleCache = async (): Promise<void> => {
  await cacheDelPattern('schedule:*');
  console.log('🗑️  Invalidated schedule cache');
};

/**
 * Invalidate user preference caches
 */
export const invalidateUserCache = async (username: string): Promise<void> => {
  await cacheDel([
    `${CACHE_KEY.USER_SCANNER_PREF}${username}`,
    `${CACHE_KEY.USER_SITE_SELECTION}${username}`,
  ]);
  console.log(`🗑️  Invalidated cache for user: ${username}`);
};

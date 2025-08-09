import { createClient } from 'redis';
import logger from '../logger/index';

const redisUrl = process.env.REDIS_URL
  || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`;

const client = createClient({ url: redisUrl });

client.on('error', (err) => {
  logger.error('Redis Client Error', err);
});

client.on('connect', () => {
  logger.info('Connected to Redis');
});

client.on('ready', () => {
  logger.info(`Redis client ready (${redisUrl})`);
});

export const isRedisConnected = () => {
  return client.isReady;
};

export default client;


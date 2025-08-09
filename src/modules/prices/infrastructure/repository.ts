import redisClient, { isRedisConnected } from '../../../shared/database/redis';
import { CryptoPrice } from '../../../shared/types';
import { PriceRepository } from '../domain/interfaces';
import logger from '../../../shared/logger/index';

export class RedisPriceRepository implements PriceRepository {
  private readonly PRICE_PREFIX = 'price:';
  private readonly HISTORY_PREFIX = 'history:';
  // In-memory fallback store when Redis is unavailable
  private memoryStore: Map<string, CryptoPrice> = new Map();
  private memoryHistory: Map<string, CryptoPrice[]> = new Map();

  async savePrice(price: CryptoPrice): Promise<void> {
    try {
      if (!isRedisConnected()) {
        // Fallback: persist in memory so latest values survive within process
        const current = this.memoryStore.get(price.symbol);
        if (!current || (price.timestamp ?? 0) >= (current.timestamp ?? 0)) {
          this.memoryStore.set(price.symbol, price);
        }
        const hist = this.memoryHistory.get(price.symbol) || [];
        if (hist.length === 0 || (hist[0]?.timestamp ?? 0) <= (price.timestamp ?? 0)) {
          hist.unshift(price);
          if (hist.length > 1000) hist.length = 1000;
          this.memoryHistory.set(price.symbol, hist);
        }
        return;
      }

      const priceKey = `${this.PRICE_PREFIX}${price.symbol}`;
      // Only overwrite if newer than stored
      const existingRaw = await redisClient.get(priceKey);
      if (existingRaw) {
        try {
          const existing: CryptoPrice = JSON.parse(existingRaw);
          if ((existing?.timestamp ?? 0) > (price?.timestamp ?? 0)) {
            // Older update, skip
            return;
          }
        } catch (_) {
          // If parse fails, continue to write
        }
      }
      await redisClient.set(priceKey, JSON.stringify(price));
      
      const historyKey = `${this.HISTORY_PREFIX}${price.symbol}`;
      // Only append to history if this is the newest tick (avoid inserting older out-of-order items at head)
      const lastHistory = await redisClient.lIndex(historyKey, 0);
      if (lastHistory) {
        try {
          const lastObj: CryptoPrice = JSON.parse(lastHistory);
          if ((lastObj?.timestamp ?? 0) <= (price?.timestamp ?? 0)) {
            await redisClient.lPush(historyKey, JSON.stringify(price));
          }
        } catch (_) {
          await redisClient.lPush(historyKey, JSON.stringify(price));
        }
      } else {
        await redisClient.lPush(historyKey, JSON.stringify(price));
      }
      await redisClient.lTrim(historyKey, 0, 999);
      await redisClient.expire(historyKey, 7 * 24 * 60 * 60);
      
    } catch (error) {
      logger.error('Error saving price to Redis:', error);
      throw new Error('Failed to save price');
    }
  }

  async getLatestPrices(symbols: string[]): Promise<CryptoPrice[]> {
    try {
      if (!isRedisConnected()) {
        const fromMemory = symbols
          .map(s => this.memoryStore.get(s))
          .filter(Boolean) as CryptoPrice[];
        if (fromMemory.length > 0) {
          return fromMemory;
        }
        logger.warn('Redis not connected and memory empty, returning mock prices');
        return this.getMockPrices(symbols);
      }

      const prices: CryptoPrice[] = [];
      
      for (const symbol of symbols) {
        const priceKey = `${this.PRICE_PREFIX}${symbol}`;
        const priceData = await redisClient.get(priceKey);
        
        if (priceData) {
          prices.push(JSON.parse(priceData));
        } else {
          const mem = this.memoryStore.get(symbol);
          if (mem) {
            prices.push(mem);
          } else {
            const [mock] = this.getMockPrices([symbol]);
            prices.push(mock);
          }
        }
      }
      
      return prices;
    } catch (error) {
      logger.error('Error getting latest prices from Redis:', error);
      return this.getMockPrices(symbols);
    }
  }

  private getMockPrices(symbols: string[]): CryptoPrice[] {
    logger.info(`Generating mock prices for symbols: ${symbols.join(', ')}`);
    
    const result = symbols.map(symbol => {
      const mockPrice = 100 + Math.random() * 1000;
      const mockChange = (Math.random() - 0.5) * 10;
      
      const priceObject = {
        symbol: symbol,
        price: mockPrice,
        timestamp: Date.now(),
        change24h: mockChange,
        volume24h: 1000000,
        marketCap: 1000000000
      };
      
      logger.info(`Created mock price object for ${symbol}:`, priceObject);
      return priceObject;
    });

    logger.info(`Generated ${result.length} mock prices:`, result);
    return result;
  }

  async getPriceHistory(symbol: string, limit: number): Promise<CryptoPrice[]> {
    try {
      if (!isRedisConnected()) {
        const mem = this.memoryHistory.get(symbol) || [];
        if (mem.length > 0) return mem.slice(0, limit);
        logger.warn('Redis not connected and no memory history, returning empty history array');
        return [];
      }

      const historyKey = `${this.HISTORY_PREFIX}${symbol}`;
      const historyData = await redisClient.lRange(historyKey, 0, limit - 1);
      
      return historyData.map(data => JSON.parse(data));
    } catch (error) {
      logger.error('Error getting price history from Redis:', error);
      throw new Error('Failed to get price history');
    }
  }
}


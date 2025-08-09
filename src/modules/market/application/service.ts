import axios from 'axios';
import redisClient, { isRedisConnected } from '../../../shared/database/redis';
import logger from '../../../shared/logger';

export interface MarketStats {
  totalMarketCap: string;
  totalVolume24h: string;
  btcDominance: string;
  ethDominance: string;
}

export class MarketService {
  private readonly CACHE_KEY = 'market:global';
  private readonly CACHE_TTL_SECONDS = 60;

  async getGlobalStats(): Promise<MarketStats> {
    try {
      // Try cache first
      if (isRedisConnected()) {
        const cached = await redisClient.get(this.CACHE_KEY);
        if (cached) {
          logger.info('Returning market stats from cache');
          return JSON.parse(cached);
        }
      }

      // Fetch from CoinGecko
      const { data } = await axios.get('https://api.coingecko.com/api/v3/global');
      const d = data?.data || {};

      const totalMarketCapUsd: number = d.total_market_cap?.usd ?? 0;
      const totalVolumeUsd: number = d.total_volume?.usd ?? 0;
      const btcDominancePct: number = d.market_cap_percentage?.btc ?? 0;
      const ethDominancePct: number = d.market_cap_percentage?.eth ?? 0;

      const formatCurrency = (n: number) => new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 2,
      }).format(n);

      const result: MarketStats = {
        totalMarketCap: formatCurrency(totalMarketCapUsd),
        totalVolume24h: formatCurrency(totalVolumeUsd),
        btcDominance: `${btcDominancePct.toFixed(1)}%`,
        ethDominance: `${ethDominancePct.toFixed(1)}%`,
      };

      // Cache result
      if (isRedisConnected()) {
        await redisClient.set(this.CACHE_KEY, JSON.stringify(result), {
          EX: this.CACHE_TTL_SECONDS,
        } as any);
      }

      return result;
    } catch (error) {
      logger.error('Failed to fetch global market stats:', error);
      // Graceful fallback
      return {
        totalMarketCap: '$0',
        totalVolume24h: '$0',
        btcDominance: '0.0%',
        ethDominance: '0.0%',
      };
    }
  }
}



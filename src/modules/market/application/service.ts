import axios from 'axios';
import redisClient, { isRedisConnected } from '../../../shared/database/redis';
import logger from '../../../shared/logger';

export interface MarketStats {
  totalMarketCap: string;
  totalVolume24h: string;
  btcDominance: string;
  ethDominance: string;
  marketChange24h?: number;
}

export class MarketService {
  private readonly CACHE_KEY = 'market:global';
  private readonly CACHE_TTL_SECONDS = 120;
  private readonly BINANCE_BASE = process.env.BINANCE_API_URL || 'https://api.binance.com';
  private readonly TARGET_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  private readonly COINGECKO_IDS: Record<string, string> = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana',
  };

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

      // Fetch from Binance: 24h stats for selected symbols (for $ volume)
      const symbolsParam = JSON.stringify(this.TARGET_SYMBOLS);
      const url = `${this.BINANCE_BASE}/api/v3/ticker/24hr`;
      const { data: binanceData } = await axios.get(url, { params: { symbols: symbolsParam } });
      const arr: any[] = Array.isArray(binanceData) ? binanceData : [];

      const bySymbol: Record<string, any> = {};
      for (const item of arr) {
        if (item?.symbol && typeof item.quoteVolume === 'string') {
          bySymbol[item.symbol] = item;
        }
      }
      const totalQuoteVolume = this.TARGET_SYMBOLS
        .map(s => parseFloat(bySymbol[s]?.quoteVolume || '0'))
        .reduce((a, b) => a + b, 0);

      const btcVol = parseFloat(bySymbol['BTCUSDT']?.quoteVolume || '0');
      const ethVol = parseFloat(bySymbol['ETHUSDT']?.quoteVolume || '0');

      // Fetch total market cap from CoinGecko (Binance не отдаёт global cap)
      let totalMarketCapUsd = 0;
      let btcCapDomPct = 0;
      let ethCapDomPct = 0;
      try {
        const { data: cg } = await axios.get('https://api.coingecko.com/api/v3/global');
        const d = cg?.data || {};
        totalMarketCapUsd = d.total_market_cap?.usd ?? 0;
        btcCapDomPct = d.market_cap_percentage?.btc ?? 0;
        ethCapDomPct = d.market_cap_percentage?.eth ?? 0;
        var marketCapChangePct = d.market_cap_change_percentage_24h_usd ?? undefined;
      } catch (_) {
        // ignore, fallback below
      }

      const formatCurrency = (n: number) => new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 2,
      }).format(n);

      const pct = (part: number, total: number) => total > 0 ? ((part / total) * 100) : 0;

      const result: MarketStats = {
        totalMarketCap: totalMarketCapUsd > 0 ? formatCurrency(totalMarketCapUsd) : 'N/A',
        totalVolume24h: formatCurrency(totalQuoteVolume),
        // Используем доминирование по капитализации, если есть. Иначе — по объёму.
        btcDominance: `${(btcCapDomPct || pct(btcVol, totalQuoteVolume)).toFixed(1)}%`,
        ethDominance: `${(ethCapDomPct || pct(ethVol, totalQuoteVolume)).toFixed(1)}%`,
        marketChange24h: marketCapChangePct,
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

  /** Prefetch latest stats and cache them (for startup warmup and scheduler) */
  async prefetchAndCache(): Promise<void> {
    try {
      const stats = await this.getGlobalStats();
      logger.info('Prefetched market stats:', stats);
    } catch (e) {
      logger.warn('Prefetch market stats failed');
    }
  }

  /** Start periodic refresh to keep cache warm and responses instant */
  startScheduler(intervalMs: number = 60_000): void {
    setInterval(() => {
      this.prefetchAndCache().catch(() => {});
    }, intervalMs);
  }

  /** Fetch market caps (USD) for base assets and cache in Redis hash 'marketcaps' */
  async fetchAndCacheMarketCaps(): Promise<void> {
    try {
      const bases = Array.from(new Set(this.TARGET_SYMBOLS.map((s) => s.replace(/USDT$/i, ''))));
      const ids = bases
        .map((b) => this.COINGECKO_IDS[b])
        .filter(Boolean)
        .join(',');
      if (!ids) return;

      const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: {
          ids,
          vs_currencies: 'usd',
          include_market_cap: 'true',
        },
      });

      const entries: Array<string> = [];
      for (const base of bases) {
        const id = this.COINGECKO_IDS[base];
        const cap = data?.[id]?.usd_market_cap;
        if (typeof cap === 'number' && isFinite(cap)) {
          entries.push(base, String(cap));
        }
      }

      if (entries.length > 0 && isRedisConnected()) {
        await redisClient.hSet('marketcaps', entries as any);
        await redisClient.expire('marketcaps', this.CACHE_TTL_SECONDS);
        logger.info('Updated market caps cache');
      }
    } catch (error) {
      logger.warn('Failed to fetch market caps');
    }
  }

  /** Periodically refresh market caps */
  startCapsScheduler(intervalMs: number = 120_000): void {
    // initial
    this.fetchAndCacheMarketCaps().catch(() => {});
    setInterval(() => {
      this.fetchAndCacheMarketCaps().catch(() => {});
    }, intervalMs);
  }
}



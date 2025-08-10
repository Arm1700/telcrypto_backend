import WebSocket from 'ws';
import { CryptoPrice } from '../../../shared/types';
import { PriceService } from '../domain/interfaces';
import { RedisPriceRepository } from '../infrastructure/repository';
import logger from '../../../shared/logger/index';
import { broadcastPriceUpdate } from '../../../shared/websocket';

export class PriceServiceImpl implements PriceService {
  private repository: RedisPriceRepository;
  private ws: WebSocket | null = null;
  private readonly DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  private readonly BINANCE_WS_URL = process.env.BINANCE_WS_URL || 'wss://stream.binance.com:9443/ws';

  constructor() {
    this.repository = new RedisPriceRepository();
  }

  startWebSocketConnection(): void {
    try {
      const streams = this.DEFAULT_SYMBOLS.map(symbol => `${symbol.toLowerCase()}@ticker`).join('/');
      const wsUrl = `${this.BINANCE_WS_URL}/${streams}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        logger.info('Connected to Binance WebSocket');
      });

      this.ws.on('message', async (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (Math.random() < 0.05) {
            logger.info('Received Binance message:', JSON.stringify(message));
            logger.info('Message keys:', Object.keys(message));
            logger.info('Message symbol:', message.s);
            logger.info('Message close price:', message.c);
          }
          
          if (message.s && message.c) {
            const price: CryptoPrice = {
              symbol: message.s,
              price: parseFloat(message.c),
              timestamp: message.E,
              change24h: parseFloat(message.P),
              // Use quote volume (q) in USDT as $ volume; base volume (v) is amount of coins
              volume24h: parseFloat(message.q),
              // Binance ticker doesn't provide market cap; omit this field
              // marketCap: undefined
            } as CryptoPrice;

            logger.info(`Created price object:`, price);
            logger.info(`Saving price for ${price.symbol}: $${price.price} (${price.change24h}%)`);
            await this.repository.savePrice(price);
            
            logger.info(`Broadcasting price update for ${price.symbol}`);
            broadcastPriceUpdate(price);
          } else {
            logger.warn('Message missing required fields (s or c):', message);
          }
        } catch (error) {
          logger.error('Error processing WebSocket message:', error);
        }
      });

      this.ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
      });

      this.ws.on('close', () => {
        logger.info('WebSocket connection closed');
        setTimeout(() => {
          this.startWebSocketConnection();
        }, 5000);
      });

    } catch (error) {
      logger.error('Error starting WebSocket connection:', error);
    }
  }

  stopWebSocketConnection(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  async getLatestPrices(symbols: string[] = this.DEFAULT_SYMBOLS): Promise<CryptoPrice[]> {
    try {
      return await this.repository.getLatestPrices(symbols);
    } catch (error) {
      logger.error('Error getting latest prices:', error);
      throw new Error('Failed to get latest prices');
    }
  }

  async getPriceHistory(symbol: string, limit: number = 100): Promise<CryptoPrice[]> {
    try {
      return await this.repository.getPriceHistory(symbol, limit);
    } catch (error) {
      logger.error('Error getting price history:', error);
      throw new Error('Failed to get price history');
    }
  }
}


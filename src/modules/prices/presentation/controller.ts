import { Request, Response } from 'express';
import { PriceController } from '../domain/interfaces';
import { PriceServiceImpl } from '../application/service';
import logger from '../../../shared/logger/index';

export class PriceControllerImpl implements PriceController {
  private priceService: PriceServiceImpl;

  constructor() {
    this.priceService = new PriceServiceImpl();
  }

  async getLatestPrices(req: Request, res: Response): Promise<void> {
    try {
      const { symbols } = req.query;
      const symbolArray = symbols ? (Array.isArray(symbols) ? symbols : [symbols]) as string[] : undefined;

      logger.info(`Getting latest prices for symbols: ${symbolArray?.join(', ') || 'all'}`);
      const prices = await this.priceService.getLatestPrices(symbolArray);
      logger.info(`Retrieved ${prices.length} prices:`, prices.map(p => `${p.symbol}: $${p.price}`));

      res.json({
        success: true,
        data: prices,
        message: 'Latest prices retrieved successfully'
      });
    } catch (error) {
      logger.error('Error getting latest prices:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get latest prices'
      });
    }
  }

  async getPriceHistory(req: Request, res: Response): Promise<void> {
    try {
      const { symbol } = req.params;
      const { limit = '100' } = req.query;
      const limitNumber = parseInt(limit as string, 10);

      if (!symbol) {
        res.status(400).json({
          success: false,
          error: 'Symbol parameter is required'
        });
        return;
      }

      const history = await this.priceService.getPriceHistory(symbol, limitNumber);

      res.json({
        success: true,
        data: history,
        message: 'Price history retrieved successfully'
      });
    } catch (error) {
      logger.error('Error getting price history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get price history'
      });
    }
  }

  async getWebSocketUrl(req: Request, res: Response): Promise<void> {
    try {
      const wsUrl = process.env.BINANCE_WS_URL || 'wss://stream.binance.com:9443/ws';
      
      res.json({
        success: true,
        data: { wsUrl },
        message: 'WebSocket URL retrieved successfully'
      });
    } catch (error) {
      logger.error('Error getting WebSocket URL:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get WebSocket URL'
      });
    }
  }
}


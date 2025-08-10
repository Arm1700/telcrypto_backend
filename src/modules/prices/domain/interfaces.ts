import { CryptoPrice } from '../../../shared/types';

export interface PriceRepository {
  savePrice(price: CryptoPrice): Promise<void>;
  getLatestPrices(symbols: string[]): Promise<CryptoPrice[]>;
  getPriceHistory(symbol: string, limit: number): Promise<CryptoPrice[]>;
}

export interface PriceService {
  startWebSocketConnection(): void;
  stopWebSocketConnection(): void;
  getLatestPrices(symbols?: string[]): Promise<CryptoPrice[]>;
  getPriceHistory(symbol: string, limit?: number): Promise<CryptoPrice[]>;
}

export interface PriceController {
  getLatestPrices(req: any, res: any): Promise<void>;
  getPriceHistory(req: any, res: any): Promise<void>;
  getWebSocketUrl(req: any, res: any): Promise<void>;
}










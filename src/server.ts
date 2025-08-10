import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

import authRoutes from './modules/auth/presentation/routes';
import priceRoutes from './modules/prices/presentation/routes';
import marketRoutes from './modules/market/presentation/routes';

import logger from './shared/logger/index';
import pool from './shared/database/postgres';
import redisClient from './shared/database/redis';
import { PriceServiceImpl } from './modules/prices/application/service';
import { MarketService } from './modules/market/application/service';
import { addWebSocketConnection, removeWebSocketConnection, sendInitialPrices } from './shared/websocket';

dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ 
  server
});
const PORT = process.env.PORT || 8000;

wss.on('connection', (ws: WebSocket) => {
  logger.info('New WebSocket connection established');
  logger.info('WebSocket readyState:', ws.readyState);
  
  addWebSocketConnection(ws);

  setTimeout(() => {
    logger.info('Getting initial prices for new WebSocket connection');
    const priceService = new PriceServiceImpl();
    priceService.getLatestPrices(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']).then(prices => {
      logger.info(`Retrieved ${prices.length} initial prices:`, prices.map(p => `${p.symbol}: $${p.price}`));
      if (prices.length > 0) {
        logger.info('Sending initial prices to client');
        sendInitialPrices(ws, prices);
      } else {
        logger.warn('No initial prices available to send');
      }
    }).catch(error => {
      logger.error('Error sending initial prices:', error);
    });
  }, 1000);

  ws.on('close', (code: number, reason: Buffer) => {
    logger.info(`WebSocket connection closed. Code: ${code}, Reason: ${reason.toString()}`);
    removeWebSocketConnection(ws);
  });

  ws.on('error', (error: Error) => {
    logger.error('WebSocket error:', error);
    logger.error('WebSocket error message:', error.message);
    logger.error('WebSocket error stack:', error.stack);
    removeWebSocketConnection(ws);
  });
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
// Apply limiter only to public GET APIs; skip internal and websocket
app.use(['/api/market', '/api/prices', '/api/auth'], limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Crypto Price Tracker API is running',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/prices', priceRoutes);
app.use('/api/market', marketRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

async function initializeServices() {
  try {
    await redisClient.connect();
    logger.info('Redis connected successfully');

    await pool.query('SELECT NOW()');
    logger.info('PostgreSQL connected successfully');

    const priceService = new PriceServiceImpl();
    priceService.startWebSocketConnection();

    const marketService = new MarketService();
    await marketService.prefetchAndCache();
    marketService.startScheduler(60_000);
    marketService.startCapsScheduler(120_000);

    server.listen(Number(PORT), '0.0.0.0', () => {
      logger.info(`Server is running on port ${PORT}`);
      logger.info(`WebSocket server is ready on ws://0.0.0.0:${PORT}`);
      logger.info(`HTTP server is ready on http://0.0.0.0:${PORT}`);
    }).on('error', (error) => {
      logger.error('Failed to start server:', error);
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  try {
    await pool.end();
    await redisClient.disconnect();
    logger.info('Database connections closed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  try {
    await pool.end();
    await redisClient.disconnect();
    logger.info('Database connections closed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Start the application
initializeServices();


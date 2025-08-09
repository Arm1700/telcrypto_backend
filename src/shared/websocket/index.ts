import { WebSocket } from 'ws';
import logger from '../logger/index';

const wsConnections = new Set<WebSocket>();

export const addWebSocketConnection = (ws: WebSocket) => {
  wsConnections.add(ws);
  logger.info('WebSocket client connected');
};

export const removeWebSocketConnection = (ws: WebSocket) => {
  wsConnections.delete(ws);
  logger.info('WebSocket client disconnected');
};

export const broadcastPriceUpdate = (price: any) => {
  logger.info(`Broadcasting price update for ${price.symbol} to ${wsConnections.size} clients`);
  logger.info('Price object being broadcast:', price);
  
  const message = JSON.stringify({
    type: 'price_update',
    data: price
  });

  logger.info(`Broadcast message content: ${message}`);
  
  let sentCount = 0;
  wsConnections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      sentCount++;
    } else {
      logger.warn(`WebSocket not ready, state: ${ws.readyState}`);
    }
  });
  
  logger.info(`Sent price update to ${sentCount} clients`);
};

export const sendInitialPrices = (ws: WebSocket, prices: any[]) => {
  logger.info(`Preparing to send initial prices: ${prices.length} items`);
  logger.info('Prices details:', prices.map(p => ({ symbol: p.symbol, price: p.price, timestamp: p.timestamp })));
  
  const message = JSON.stringify({
    type: 'initial_prices',
    data: prices
  });

  logger.info(`Sending initial prices to client: ${prices.length} items`);
  logger.info('Message being sent:', message);
  
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(message);
  } else {
    logger.warn('WebSocket not ready, cannot send initial prices');
  }
};

export const getConnectionCount = () => {
  return wsConnections.size;
};

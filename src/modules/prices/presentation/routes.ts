import { Router } from 'express';
import { PriceControllerImpl } from './controller';
import { optionalAuth } from '../../../shared/middleware/auth';

const router = Router();
const priceController = new PriceControllerImpl();

router.get('/latest', optionalAuth, priceController.getLatestPrices.bind(priceController));

router.get('/history/:symbol', optionalAuth, priceController.getPriceHistory.bind(priceController));

router.get('/ws-url', priceController.getWebSocketUrl.bind(priceController));

export default router;







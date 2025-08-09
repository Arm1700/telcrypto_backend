import { Router } from 'express';
import { MarketService } from '../application/service';

const router = Router();
const marketService = new MarketService();

router.get('/global', async (_req, res) => {
  const data = await marketService.getGlobalStats();
  res.json({ success: true, data, message: 'Global market stats' });
});

export default router;



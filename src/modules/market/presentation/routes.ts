import { Router } from 'express';
import { MarketService } from '../application/service';
import redisClient from '../../../shared/database/redis';

const router = Router();
const marketService = new MarketService();

router.get('/global', async (_req, res) => {
  const data = await marketService.getGlobalStats();
  res.json({ success: true, data, message: 'Global market stats' });
});

router.get('/caps', async (_req, res) => {
  try {
    const map = await redisClient.hGetAll('marketcaps');
    const normalized: Record<string, number> = {};
    Object.entries(map || {}).forEach(([base, cap]) => {
      const num = Number(cap);
      if (!Number.isNaN(num) && Number.isFinite(num)) {
        normalized[base] = num;
      }
    });
    res.json({ success: true, data: normalized, message: 'Market caps' });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to load market caps' });
  }
});

export default router;



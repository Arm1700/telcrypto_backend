import { Router } from 'express';
import { AuthControllerImpl } from './controller';
import { authenticateToken } from '../../../shared/middleware/auth';

const router = Router();
const authController = new AuthControllerImpl();

router.post('/telegram', authController.telegramAuth.bind(authController));
router.get('/telegram/callback', authController.telegramCallback.bind(authController));

router.get('/verify', authenticateToken, authController.verifyToken.bind(authController));

export default router;





import { Request, Response } from 'express';
import { AuthController } from '../domain/interfaces';
import { AuthServiceImpl } from '../application/service';
import { TelegramAuthData } from '../../../shared/types';
import logger from '../../../shared/logger/index';

export class AuthControllerImpl implements AuthController {
  private authService: AuthServiceImpl;

  constructor() {
    this.authService = new AuthServiceImpl();
  }

  async telegramAuth(req: Request, res: Response): Promise<void> {
    try {
      const authData: TelegramAuthData = req.body;
      // If WebApp payload is present, prefer it
      if ((req.body as any).user && !(authData as any).id) {
        try {
          const userObj = JSON.parse((req.body as any).user);
          (authData as any).id = userObj.id;
          (authData as any).first_name = userObj.first_name;
          (authData as any).last_name = userObj.last_name;
          (authData as any).username = userObj.username;
          (authData as any).photo_url = userObj.photo_url;
        } catch {}
      }

      // Validate Telegram auth data
      const isValid = await this.authService.validateTelegramAuth(authData);

      if (!isValid) {
        res.status(401).json({
          success: false,
          error: 'Invalid Telegram authentication data'
        });
        return;
      }

      // Authenticate user
      const { user, token } = await this.authService.authenticateUser(
        authData.id,
        {
          username: authData.username,
          first_name: authData.first_name,
          last_name: authData.last_name
        }
      );

      res.json({
        success: true,
        data: {
          user,
          token
        },
        message: 'Authentication successful'
      });
    } catch (error) {
      logger.error('Error in telegram auth:', error);
      res.status(500).json({
        success: false,
        error: 'Authentication failed'
      });
    }
  }

  async verifyToken(req: Request, res: Response): Promise<void> {
    try {
      // Token is already verified by middleware
      const user = req.user;

      res.json({
        success: true,
        data: { user },
        message: 'Token is valid'
      });
    } catch (error) {
      logger.error('Error verifying token:', error);
      res.status(500).json({
        success: false,
        error: 'Token verification failed'
      });
    }
  }

  async telegramCallback(req: Request, res: Response): Promise<void> {
    try {
      const q = req.query as any;
      const authData: TelegramAuthData = {
        id: parseInt(q.id, 10),
        first_name: q.first_name,
        last_name: q.last_name,
        username: q.username,
        photo_url: q.photo_url,
        auth_date: parseInt(q.auth_date, 10),
        hash: q.hash
      };

      const isValid = await this.authService.validateTelegramAuth(authData);
      if (!isValid) {
        res.status(401).send('Invalid Telegram data');
        return;
      }

      const { user, token } = await this.authService.authenticateUser(authData.id, {
        username: authData.username,
        first_name: authData.first_name,
        last_name: authData.last_name
      });

      // Redirect back to frontend with token (for dev; in prod set httpOnly cookie instead)
      const frontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, '') || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/?token=${encodeURIComponent(token)}`);
    } catch (error) {
      logger.error('Error in telegram callback:', error);
      res.status(500).send('Authentication failed');
    }
  }
}


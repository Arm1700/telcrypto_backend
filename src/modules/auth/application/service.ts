import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { User, TelegramAuthData } from '../../../shared/types';
import { AuthService } from '../domain/interfaces';
import { PostgresAuthRepository } from '../infrastructure/repository';
import logger from '../../../shared/logger/index';

export class AuthServiceImpl implements AuthService {
  private repository: PostgresAuthRepository;

  constructor() {
    this.repository = new PostgresAuthRepository();
  }

  async validateTelegramAuth(authData: TelegramAuthData): Promise<boolean> {
    try {
      const { hash, auth_date, user: webAppUserJson, query_id, ...rest } = authData as any;
      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      if (!botToken) {
        logger.error('Telegram bot token not configured');
        return false;
      }

      // Reject too old auth (5 minutes)
      const now = Math.floor(Date.now() / 1000);
      if (!auth_date || Math.abs(now - auth_date) > 300) {
        logger.warn('Telegram auth date is too old');
        return false;
      }

      // Build data-check-string: sorted key=value (exclude hash)
      let data: Record<string, string | number> = {};
      // If WebApp fields are present, only include the exact WebApp keys
      if (typeof webAppUserJson === 'string' || typeof query_id === 'string') {
        data.auth_date = auth_date as number;
        if (typeof webAppUserJson === 'string') {
          data.user = webAppUserJson;
        }
        if (typeof query_id === 'string') {
          data.query_id = query_id;
        }
      } else {
        // Fallback to Login Widget-style payload
        data = { ...rest, auth_date } as any;
      }
      const dataCheckString = Object.keys(data)
        .sort()
        .map((key) => `${key}=${data[key as keyof typeof data]}`)
        .join('\n');

      // Try both signature schemes to support WebApp and Login Widget
      // 1) WebApp: secretKey = HMAC_SHA256("WebAppData", bot_token)
      const webAppSecret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
      const webAppHash = crypto.createHmac('sha256', webAppSecret).update(dataCheckString).digest('hex');

      // 2) Login Widget: secretKey = SHA256(bot_token)
      const widgetSecret = crypto.createHash('sha256').update(botToken).digest();
      const widgetHash = crypto.createHmac('sha256', widgetSecret).update(dataCheckString).digest('hex');

      const valid = hash === webAppHash || hash === widgetHash;
      if (!valid) {
        logger.warn('Telegram auth signature mismatch');
      }
      return valid;
    } catch (error) {
      logger.error('Error validating Telegram auth:', error);
      return false;
    }
  }

  async authenticateUser(telegramId: number, userData: Partial<User>): Promise<{ user: User; token: string }> {
    try {
      // Check if user exists
      let user = await this.repository.findUserByTelegramId(telegramId);

      if (!user) {
        // Create new user
        user = await this.repository.createUser({
          telegram_id: telegramId,
          username: userData.username,
          first_name: userData.first_name,
          last_name: userData.last_name
        });
      } else {
        // Update existing user
        user = await this.repository.updateUser(user.id, userData);
      }

      const token = this.generateToken(user);

      return { user, token };
    } catch (error) {
      logger.error('Error authenticating user:', error);
      throw new Error('Authentication failed');
    }
  }

  generateToken(user: User): string {
    const payload = {
      id: user.id,
      telegram_id: user.telegram_id,
      username: user.username
    };

    return jwt.sign(payload, process.env.JWT_SECRET || 'your-secret-key', {
      expiresIn: '7d'
    });
  }
}


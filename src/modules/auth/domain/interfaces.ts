import { User, TelegramAuthData } from '../../../shared/types';

export interface AuthRepository {
  createUser(userData: Partial<User>): Promise<User>;
  findUserByTelegramId(telegramId: number): Promise<User | null>;
  updateUser(id: number, userData: Partial<User>): Promise<User>;
}

export interface AuthService {
  validateTelegramAuth(authData: TelegramAuthData): Promise<boolean>;
  authenticateUser(telegramId: number, userData: Partial<User>): Promise<{ user: User; token: string }>;
  generateToken(user: User): string;
}

export interface AuthController {
  telegramAuth(req: any, res: any): Promise<void>;
  verifyToken(req: any, res: any): Promise<void>;
}

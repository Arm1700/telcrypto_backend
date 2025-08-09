import pool from '../../../shared/database/postgres';
import { User } from '../../../shared/types';
import { AuthRepository } from '../domain/interfaces';
import logger from '../../../shared/logger/index';

export class PostgresAuthRepository implements AuthRepository {
  async createUser(userData: Partial<User>): Promise<User> {
    const { telegram_id, username, first_name, last_name } = userData;
    
    const query = `
      INSERT INTO users (telegram_id, username, first_name, last_name, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING *
    `;
    
    try {
      const result = await pool.query(query, [telegram_id, username, first_name, last_name]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating user:', error);
      throw new Error('Failed to create user');
    }
  }

  async findUserByTelegramId(telegramId: number): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE telegram_id = $1';
    
    try {
      const result = await pool.query(query, [telegramId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding user by telegram ID:', error);
      throw new Error('Failed to find user');
    }
  }

  async updateUser(id: number, userData: Partial<User>): Promise<User> {
    const { username, first_name, last_name } = userData;
    
    const query = `
      UPDATE users 
      SET username = $2, first_name = $3, last_name = $4, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    
    try {
      const result = await pool.query(query, [id, username, first_name, last_name]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating user:', error);
      throw new Error('Failed to update user');
    }
  }
}


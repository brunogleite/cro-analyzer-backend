import { BaseRepository } from './base.repository';
import {
  User,
  CreateUserRequest,
  UpdateUserRequest,
  UserFilters,
} from '../models/user.model';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

export class UserRepository extends BaseRepository {
  async create(data: CreateUserRequest): Promise<User> {
    const id = uuidv4();
    const now = new Date();
    
    // Hash the password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(data.password, saltRounds);
    
    const sql = `
      INSERT INTO users (
        id, email, password, first_name, last_name, role, is_active,
        last_login_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.execute(sql, [
      id,
      data.email.toLowerCase(),
      hashedPassword,
      data.firstName,
      data.lastName,
      data.role || 'user',
      true, // is_active
      null, // last_login_at
      now.toISOString(),
      now.toISOString(),
    ]);

    const user = await this.findById(id);
    if (!user) {
      throw new Error('Failed to create user');
    }
    return user;
  }

  async findById(id: string): Promise<User | null> {
    const sql = 'SELECT * FROM users WHERE id = ?';
    const row = await this.queryOne(sql, [id]);
    
    if (!row) return null;
    
    return this.mapRowToUser(row);
  }

  async findByEmail(email: string): Promise<User | null> {
    const sql = 'SELECT * FROM users WHERE email = ?';
    const row = await this.queryOne(sql, [email.toLowerCase()]);
    
    if (!row) return null;
    
    return this.mapRowToUser(row);
  }

  async update(id: string, data: UpdateUserRequest): Promise<User | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const params: any[] = [];

    if (data.firstName !== undefined) {
      updates.push('first_name = ?');
      params.push(data.firstName);
    }

    if (data.lastName !== undefined) {
      updates.push('last_name = ?');
      params.push(data.lastName);
    }

    if (data.role !== undefined) {
      updates.push('role = ?');
      params.push(data.role);
    }

    if (data.isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(data.isActive);
    }

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());

    params.push(id);

    const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    await this.execute(sql, params);

    return this.findById(id);
  }

  async updateLastLogin(id: string): Promise<void> {
    const sql = 'UPDATE users SET last_login_at = ? WHERE id = ?';
    await this.execute(sql, [new Date().toISOString(), id]);
  }

  async changePassword(id: string, newPassword: string): Promise<boolean> {
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    const sql = 'UPDATE users SET password = ?, updated_at = ? WHERE id = ?';
    const result = await this.execute(sql, [
      hashedPassword,
      new Date().toISOString(),
      id
    ]);
    
    return result.changes > 0 || result.rowCount > 0;
  }

  async find(filters: UserFilters = {}): Promise<User[]> {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.role) {
      conditions.push('role = ?');
      params.push(filters.role);
    }

    if (filters.isActive !== undefined) {
      conditions.push('is_active = ?');
      params.push(filters.isActive);
    }

    if (filters.email) {
      conditions.push('email LIKE ?');
      params.push(`%${filters.email}%`);
    }

    let sql = 'SELECT * FROM users';
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ' ORDER BY created_at DESC';

    if (filters.limit) {
      sql += ` LIMIT ${filters.limit}`;
      if (filters.offset) {
        sql += ` OFFSET ${filters.offset}`;
      }
    }

    const rows = await this.query(sql, params);
    return rows.map((row: any) => this.mapRowToUser(row));
  }

  async delete(id: string): Promise<boolean> {
    const sql = 'DELETE FROM users WHERE id = ?';
    const result = await this.execute(sql, [id]);
    return result.changes > 0 || result.rowCount > 0;
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password);
  }

  private mapRowToUser(row: any): User {
    return {
      id: row.id,
      email: row.email,
      password: row.password,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role,
      isActive: Boolean(row.is_active),
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
} 
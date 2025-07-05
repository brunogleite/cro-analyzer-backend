import { DatabaseConfig, getDatabaseConfig } from '../config/database.config';
import { AnalysisRepository } from '../repositories/analysis.repository';
import sqlite3 from 'sqlite3';
import { Pool, PoolClient } from 'pg';

export interface DatabaseService {
  getAnalysisRepository(): AnalysisRepository;
  healthCheck(): Promise<boolean>;
  close(): Promise<void>;
}

export class DatabaseServiceImpl implements DatabaseService {
  private db: any;
  private config: DatabaseConfig;
  private analysisRepository!: AnalysisRepository;

  constructor() {
    this.config = getDatabaseConfig();
  }

  async initialize(): Promise<void> {
    try {
      if (this.config.type === 'sqlite') {
        this.db = new sqlite3.Database(this.config.database, (err: any) => {
          if (err) {
            console.error('Error opening SQLite database:', err);
            throw err;
          }
          console.log('✅ Connected to SQLite database');
        });

        // Enable foreign keys and WAL mode for better performance
        await this.execute('PRAGMA foreign_keys = ON');
        await this.execute('PRAGMA journal_mode = WAL');
      } else {
        this.db = new Pool({
          host: this.config.host,
          port: this.config.port,
          database: this.config.database,
          user: this.config.username,
          password: this.config.password,
          ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
          max: this.config.pool?.max || 10,
          min: this.config.pool?.min || 2,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
        });

        // Test the connection
        const client = await this.db.connect();
        client.release();
        console.log('✅ Connected to PostgreSQL database');
      }

      this.analysisRepository = new AnalysisRepository(this.db, this.config);
      
      // Run migrations
      await this.runMigrations();
      
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  getAnalysisRepository(): AnalysisRepository {
    if (!this.analysisRepository) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.analysisRepository;
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (this.config.type === 'sqlite') {
        return new Promise((resolve) => {
          this.db.get('SELECT 1 as health', (err: any) => {
            resolve(!err);
          });
        });
      } else {
        const client = await this.db.connect();
        const result = await client.query('SELECT 1 as health');
        client.release();
        return result.rows.length > 0;
      }
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  async close(): Promise<void> {
    try {
      if (this.config.type === 'sqlite') {
        return new Promise((resolve, reject) => {
          this.db.close((err: any) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } else {
        await this.db.end();
      }
      console.log('✅ Database connection closed');
    } catch (error) {
      console.error('❌ Error closing database connection:', error);
      throw error;
    }
  }

  private async execute(sql: string, params: any[] = []): Promise<any> {
    if (this.config.type === 'sqlite') {
      return new Promise((resolve, reject) => {
        this.db.run(sql, params, function(this: any, err: any) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    } else {
      const result = await this.db.query(sql, params);
      return { rowCount: result.rowCount };
    }
  }

  private async runMigrations(): Promise<void> {
    const migrations = [
      `
        CREATE TABLE IF NOT EXISTS analyses (
          id TEXT PRIMARY KEY,
          url TEXT NOT NULL,
          page_title TEXT,
          analysis TEXT,
          pdf_path TEXT,
          metadata TEXT NOT NULL DEFAULT '{}',
          status TEXT NOT NULL DEFAULT 'pending',
          error_message TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_analyses_status 
        ON analyses(status)
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_analyses_created_at 
        ON analyses(created_at)
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_analyses_url 
        ON analyses(url)
      `
    ];

    for (const migration of migrations) {
      await this.execute(migration);
    }

    console.log('✅ Database migrations completed');
  }
} 
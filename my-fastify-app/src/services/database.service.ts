import { DatabaseConfig, getDatabaseConfig } from '../config/database.config';
import { AnalysisRepository } from '../repositories/analysis.repository';
import { UserRepository } from '../repositories/user.repository';
import sqlite3 from 'sqlite3';
import { Pool, PoolClient } from 'pg';

export interface DatabaseService {
  getAnalysisRepository(): AnalysisRepository;
  getUserRepository(): UserRepository;
  healthCheck(): Promise<boolean>;
  close(): Promise<void>;
}

export class DatabaseServiceImpl implements DatabaseService {
  public db: any;
  public config: DatabaseConfig;
  private analysisRepository!: AnalysisRepository;
  private userRepository!: UserRepository;

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

      // Run initial migrations (creates tables with proper schema)
      await this.runMigrations();
      
      this.analysisRepository = new AnalysisRepository(this.db, this.config);
      this.userRepository = new UserRepository(this.db, this.config);
      
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

  getUserRepository(): UserRepository {
    if (!this.userRepository) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.userRepository;
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

  async execute(sql: string, params: any[] = []): Promise<any> {
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

  async query(sql: string, params: any[] = []): Promise<any[]> {
    if (this.config.type === 'sqlite') {
      return new Promise((resolve, reject) => {
        this.db.all(sql, params, (err: any, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
    } else {
      const result = await this.db.query(sql, params);
      return result.rows || [];
    }
  }

  private async runMigrations(): Promise<void> {
    const migrations = [
      // First create users table
      `
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          is_active BOOLEAN NOT NULL DEFAULT true,
          last_login_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_users_email 
        ON users(email)
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_users_role 
        ON users(role)
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_users_is_active 
        ON users(is_active)
      `
    ];

    // Run user table migrations
    for (const migration of migrations) {
      await this.execute(migration);
    }

    // Handle analyses table with proper migration logic
    await this.migrateAnalysesTable();

    console.log('✅ Database migrations completed');
  }

  private async migrateAnalysesTable(): Promise<void> {
    // Check if analyses table exists
    const tableExists = await this.checkTableExists('analyses');
    
    if (!tableExists) {
      // Create new table with user_id column
      await this.execute(`
        CREATE TABLE analyses (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          url TEXT NOT NULL,
          page_title TEXT,
          analysis TEXT,
          pdf_path TEXT,
          metadata TEXT NOT NULL DEFAULT '{}',
          status TEXT NOT NULL DEFAULT 'pending',
          error_message TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      
      // Create indexes
      await this.execute('CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON analyses(user_id)');
      await this.execute('CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses(status)');
      await this.execute('CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(created_at)');
      await this.execute('CREATE INDEX IF NOT EXISTS idx_analyses_url ON analyses(url)');
      
      console.log('✅ Created new analyses table with user_id column');
    } else {
      // Check if user_id column exists
      const hasUserIdColumn = await this.checkColumnExists('analyses', 'user_id');
      
      if (!hasUserIdColumn) {
        console.log('🔄 Migrating existing analyses table to add user_id column...');
        
        // For SQLite, we need to recreate the table since ALTER TABLE is limited
        if (this.config.type === 'sqlite') {
          await this.recreateAnalysesTableWithUserId();
        } else {
          // For PostgreSQL, we can add the column
          await this.execute('ALTER TABLE analyses ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE');
          await this.execute('CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON analyses(user_id)');
        }
        
        console.log('✅ Successfully added user_id column to analyses table');
      }
    }
  }

  private async checkTableExists(tableName: string): Promise<boolean> {
    if (this.config.type === 'sqlite') {
      const result = await this.query(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
      );
      return result.length > 0;
    } else {
      const result = await this.query(
        "SELECT table_name FROM information_schema.tables WHERE table_name = ?",
        [tableName]
      );
      return result.length > 0;
    }
  }

  private async checkColumnExists(tableName: string, columnName: string): Promise<boolean> {
    if (this.config.type === 'sqlite') {
      const result = await this.query(
        `PRAGMA table_info('${tableName}')`
      );
      return result.some((row: any) => row.name === columnName);
    } else {
      const result = await this.query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = ? AND column_name = ?`,
        [tableName, columnName]
      );
      return result.length > 0;
    }
  }

  private async recreateAnalysesTableWithUserId(): Promise<void> {
    // Get existing data
    let existingData: any[] = [];
    try {
      existingData = await this.query('SELECT * FROM analyses');
    } catch (error) {
      // Table might not exist or be empty
      console.log('📝 No existing analyses data to migrate');
    }
    
    // Create a temporary table with the new schema
    await this.execute(`
      CREATE TABLE analyses_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        url TEXT NOT NULL,
        page_title TEXT,
        analysis TEXT,
        pdf_path TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending',
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    // Create indexes on the new table
    await this.execute('CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON analyses_new(user_id)');
    await this.execute('CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses_new(status)');
    await this.execute('CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses_new(created_at)');
    await this.execute('CREATE INDEX IF NOT EXISTS idx_analyses_url ON analyses_new(url)');
    
    // Create a default user for existing analyses if needed
    const defaultUser = await this.createDefaultUserIfNeeded();
    
    // Migrate existing data
    if (existingData && existingData.length > 0) {
      console.log(`🔄 Migrating ${existingData.length} existing analyses...`);
      for (const row of existingData) {
        await this.execute(`
          INSERT INTO analyses_new (
            id, user_id, url, page_title, analysis, pdf_path, metadata, 
            status, error_message, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          row.id,
          defaultUser.id,
          row.url,
          row.page_title,
          row.analysis,
          row.pdf_path,
          row.metadata || '{}',
          row.status || 'pending',
          row.error_message,
          row.created_at,
          row.updated_at
        ]);
      }
      console.log('✅ Existing analyses migrated successfully');
    }
    
    // Drop the old table and rename the new one
    await this.execute('DROP TABLE analyses');
    await this.execute('ALTER TABLE analyses_new RENAME TO analyses');
  }

  private async createDefaultUserIfNeeded(): Promise<any> {
    // Check if any users exist
    const users = await this.query('SELECT * FROM users LIMIT 1');
    
    if (users.length > 0) {
      return users[0]; // Return the first user
    }
    
    // Create a default admin user
    const defaultUserId = 'default-admin-user';
    const now = new Date().toISOString();
    
    await this.execute(`
      INSERT INTO users (
        id, email, password, first_name, last_name, role, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      defaultUserId,
      'admin@cro-analyzer.com',
      'default-password-hash', // This should be properly hashed in production
      'Default',
      'Admin',
      'admin',
      true,
      now,
      now
    ]);
    
    console.log('✅ Created default admin user for existing analyses');
    
    return { id: defaultUserId };
  }
} 
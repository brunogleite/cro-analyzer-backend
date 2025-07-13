import { DatabaseServiceImpl } from './database.service';

export class MigrationService {
  private dbService: DatabaseServiceImpl;

  constructor(dbService: DatabaseServiceImpl) {
    this.dbService = dbService;
  }

  async runMigrations(): Promise<void> {
    console.log('🔄 Running database migrations...');
    
    try {
      // For SQLite, we'll always recreate the table to ensure proper schema
      if (this.dbService.config.type === 'sqlite') {
        console.log('📝 Recreating analyses table with user_id column...');
        await this.recreateAnalysesTable();
      } else {
        // For PostgreSQL, check and add column if needed
        const hasUserIdColumn = await this.checkIfColumnExists('analyses', 'user_id');
        
        if (!hasUserIdColumn) {
          console.log('📝 Adding user_id column to analyses table...');
          await this.addUserIdColumn();
        }

        // Check if foreign key constraint exists
        const hasForeignKey = await this.checkIfForeignKeyExists();
        
        if (!hasForeignKey) {
          console.log('🔗 Adding foreign key constraint...');
          await this.addForeignKeyConstraint();
        }
      }

      console.log('✅ Database migrations completed successfully');
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  private async checkIfColumnExists(table: string, column: string): Promise<boolean> {
    if (this.dbService.config.type === 'sqlite') {
      try {
        const result = await this.dbService.query(
          "PRAGMA table_info(analyses)"
        );
        // Check if user_id column exists in the table info
        return result.some((row: any) => row.name === 'user_id');
      } catch (error) {
        // If table doesn't exist, column doesn't exist
        return false;
      }
    } else {
      const result = await this.dbService.execute(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = 'analyses' AND column_name = 'user_id'`
      );
      return result.rows && result.rows.length > 0;
    }
  }

  private async checkIfForeignKeyExists(): Promise<boolean> {
    if (this.dbService.config.type === 'sqlite') {
      // SQLite doesn't have a direct way to check foreign keys
      return true; // We'll handle this in the migration
    } else {
      const result = await this.dbService.execute(
        `SELECT constraint_name FROM information_schema.table_constraints 
         WHERE table_name = 'analyses' AND constraint_type = 'FOREIGN KEY'`
      );
      return result.rows && result.rows.length > 0;
    }
  }

  private async addUserIdColumn(): Promise<void> {
    if (this.dbService.config.type === 'sqlite') {
      // SQLite doesn't support adding columns with constraints in ALTER TABLE
      // We need to recreate the table
      await this.recreateAnalysesTable();
    } else {
      await this.dbService.execute(
        'ALTER TABLE analyses ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE'
      );
    }
  }

  private async addForeignKeyConstraint(): Promise<void> {
    if (this.dbService.config.type === 'sqlite') {
      // Foreign key is already added in table recreation
      return;
    } else {
      await this.dbService.execute(
        'ALTER TABLE analyses ADD CONSTRAINT fk_analyses_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'
      );
    }
  }

  private async recreateAnalysesTable(): Promise<void> {
    // This is a complex operation for SQLite
    // We'll create a new table with the correct schema and migrate data
    
    // First, check if the analyses table exists and get existing data
    let existingData: any[] = [];
    try {
      existingData = await this.dbService.query('SELECT * FROM analyses');
    } catch (error) {
      // Table doesn't exist yet, which is fine for new installations
      console.log('📝 Analyses table doesn\'t exist yet, creating new one...');
    }
    
    // Drop the old table if it exists
    await this.dbService.execute('DROP TABLE IF EXISTS analyses');
    
    // Create the new table with user_id column
    await this.dbService.execute(`
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
    await this.dbService.execute('CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON analyses(user_id)');
    await this.dbService.execute('CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses(status)');
    await this.dbService.execute('CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(created_at)');
    await this.dbService.execute('CREATE INDEX IF NOT EXISTS idx_analyses_url ON analyses(url)');
    
    // For existing data, we need to assign a default user or handle it appropriately
    // For now, we'll create a default admin user if none exists
    const defaultUser = await this.createDefaultUserIfNeeded();
    
    // Migrate existing data with the default user
    if (existingData && existingData.length > 0) {
      console.log(`🔄 Migrating ${existingData.length} existing analyses...`);
      for (const row of existingData) {
        await this.dbService.execute(`
          INSERT INTO analyses (
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
          row.metadata,
          row.status,
          row.error_message,
          row.created_at,
          row.updated_at
        ]);
      }
      console.log('✅ Existing analyses migrated successfully');
    }
  }

  private async createDefaultUserIfNeeded(): Promise<any> {
    // Check if any users exist
    let users: any[] = [];
    try {
      users = await this.dbService.query('SELECT * FROM users LIMIT 1');
    } catch (error) {
      // Users table doesn't exist yet, which means this is a fresh installation
      console.log('📝 Users table doesn\'t exist yet, this will be created by the main migration');
      return { id: 'default-admin-user' };
    }
    
    if (users && users.length > 0) {
      return users[0]; // Return the first user
    }
    
    // Create a default admin user
    const defaultUserId = 'default-admin-user';
    const now = new Date().toISOString();
    
    await this.dbService.execute(`
      INSERT INTO users (
        id, email, password, first_name, last_name, role, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      defaultUserId,
      'admin@cro-analyzer.com',
      '$2b$10$default.hashed.password.for.admin.user', // This should be properly hashed
      'Admin',
      'User',
      'admin',
      true,
      now,
      now
    ]);
    
    return { id: defaultUserId };
  }
} 
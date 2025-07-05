import { DatabaseConfig } from '../config/database.config';

export abstract class BaseRepository {
  protected db: any;
  protected config: DatabaseConfig;

  constructor(db: any, config: DatabaseConfig) {
    this.db = db;
    this.config = config;
  }

  protected async query(sql: string, params: any[] = []): Promise<any> {
    try {
      if (this.config.type === 'sqlite') {
        return new Promise((resolve, reject) => {
          this.db.all(sql, params, (err: any, rows: any) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
      } else {
        const result = await this.db.query(sql, params);
        return result.rows;
      }
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  protected async queryOne(sql: string, params: any[] = []): Promise<any> {
    try {
      if (this.config.type === 'sqlite') {
        return new Promise((resolve, reject) => {
          this.db.get(sql, params, (err: any, row: any) => {
            if (err) reject(err);
            else resolve(row);
          });
        });
      } else {
        const result = await this.db.query(sql, params);
        return result.rows[0];
      }
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  protected async execute(sql: string, params: any[] = []): Promise<any> {
    try {
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
    } catch (error) {
      console.error('Database execute error:', error);
      throw error;
    }
  }

  protected async transaction<T>(callback: () => Promise<T>): Promise<T> {
    if (this.config.type === 'sqlite') {
      return new Promise((resolve, reject) => {
        this.db.serialize(() => {
          this.db.run('BEGIN TRANSACTION');
          callback()
            .then((result) => {
              this.db.run('COMMIT');
              resolve(result);
            })
            .catch((error) => {
              this.db.run('ROLLBACK');
              reject(error);
            });
        });
      });
    } else {
      const client = await this.db.connect();
      try {
        await client.query('BEGIN');
        const result = await callback();
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  }
} 
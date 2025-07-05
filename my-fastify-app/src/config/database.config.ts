export interface DatabaseConfig {
  type: 'postgresql' | 'sqlite';
  host?: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  pool?: {
    min: number;
    max: number;
  };
}

export const getDatabaseConfig = (): DatabaseConfig => {
  const dbType = process.env.DB_TYPE || 'sqlite';
  
  if (dbType === 'postgresql') {
    return {
      type: 'postgresql',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'cro_analyzer',
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl: process.env.DB_SSL === 'true',
      pool: {
        min: parseInt(process.env.DB_POOL_MIN || '2'),
        max: parseInt(process.env.DB_POOL_MAX || '10'),
      },
    };
  }
  
  return {
    type: 'sqlite',
    database: process.env.DB_PATH || './cro_analyzer.db',
  };
}; 
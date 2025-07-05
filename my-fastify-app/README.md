# CRO Analyzer Backend

A Fastify-based backend service for analyzing landing pages and generating CRO (Conversion Rate Optimization) reports.

## Features

- **Page Scraping**: Automated web page content extraction
- **AI Analysis**: GPT-powered CRO analysis and recommendations
- **PDF Reports**: Automated PDF report generation
- **Database Storage**: Persistent storage of analysis results
- **RESTful API**: Clean API endpoints for all operations
- **Health Monitoring**: Database and service health checks

## Database Implementation

This application implements a comprehensive database layer with the following architecture:

### Database Support
- **SQLite**: Default for development (file-based)
- **PostgreSQL**: Production-ready with connection pooling

### Architecture Components

1. **Configuration Layer** (`src/config/database.config.ts`)
   - Environment-based database configuration
   - Support for both SQLite and PostgreSQL
   - Connection pooling configuration

2. **Repository Pattern** (`src/repositories/`)
   - `BaseRepository`: Common database operations
   - `AnalysisRepository`: CRO analysis-specific operations
   - Type-safe database queries
   - Transaction support

3. **Service Layer** (`src/services/database.service.ts`)
   - Database connection management
   - Automatic migrations
   - Health checks
   - Graceful shutdown

4. **Plugin Integration** (`src/plugins/database.plugin.ts`)
   - Fastify plugin architecture
   - Application lifecycle management
   - Health check endpoints

### Data Models

The application stores the following data:

```typescript
interface AnalysisRecord {
  id: string;
  url: string;
  pageTitle?: string;
  analysis: string;
  pdfPath?: string;
  metadata: {
    wordCount: number;
    analysisTokens: number;
    pageSize: number;
    loadTime?: number;
    screenshotPath?: string;
  };
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure your settings:

```bash
cp env.example .env
```

Edit `.env` with your configuration:

```env
# Database Configuration
DB_TYPE=sqlite
DB_PATH=./cro_analyzer.db

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Database Setup

The database will be automatically created and migrated on first run. For manual setup:

```bash
# Run migrations
npm run db:migrate

# Seed data (if needed)
npm run db:seed
```

### 4. Start Development Server

```bash
npm run dev
```

## API Endpoints

### CRO Analysis

- `POST /api/cro/analyze` - Analyze a landing page
- `GET /api/cro/analysis/:id` - Get analysis by ID
- `GET /api/cro/analyses` - List all analyses with filters
- `GET /api/cro/analyses/stats` - Get analysis statistics

### Health Checks

- `GET /health/db` - Database health check

## Database Operations

### Creating an Analysis

```typescript
const analysisRepo = fastify.db.getAnalysisRepository();
const analysis = await analysisRepo.create({
  url: 'https://example.com',
  pageTitle: 'Example Landing Page'
});
```

### Updating Analysis Status

```typescript
await analysisRepo.update(analysisId, {
  status: 'completed',
  analysis: 'Analysis results...',
  pdfPath: '/path/to/report.pdf'
});
```

### Querying Analyses

```typescript
// Get all completed analyses
const analyses = await analysisRepo.find({
  status: 'completed',
  limit: 10
});

// Get statistics
const stats = await analysisRepo.getStats();
```

## Database Configuration

### SQLite (Development)

```env
DB_TYPE=sqlite
DB_PATH=./cro_analyzer.db
```

### PostgreSQL (Production)

```env
DB_TYPE=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cro_analyzer
DB_USER=postgres
DB_PASSWORD=your_password
DB_SSL=false
DB_POOL_MIN=2
DB_POOL_MAX=10
```

## Migration and Schema

The database schema is automatically created on startup:

```sql
CREATE TABLE analyses (
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
);

CREATE INDEX idx_analyses_status ON analyses(status);
CREATE INDEX idx_analyses_created_at ON analyses(created_at);
CREATE INDEX idx_analyses_url ON analyses(url);
```

## Error Handling

The database layer includes comprehensive error handling:

- Connection failures
- Query errors
- Transaction rollbacks
- Graceful degradation

## Performance Considerations

- **Connection Pooling**: PostgreSQL uses connection pooling for better performance
- **Indexes**: Optimized indexes on frequently queried columns
- **WAL Mode**: SQLite uses WAL mode for better concurrency
- **Query Optimization**: Efficient queries with proper parameterization

## Monitoring

- Health check endpoint: `GET /health/db`
- Database statistics via repository methods
- Comprehensive logging throughout the database layer

## Testing

The repository pattern makes it easy to mock database operations for testing:

```typescript
// Mock the repository for testing
const mockRepo = {
  create: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  find: jest.fn(),
  getStats: jest.fn()
};
```

## Production Deployment

For production deployment:

1. Use PostgreSQL for better performance and reliability
2. Configure proper connection pooling
3. Set up database backups
4. Monitor database performance
5. Use environment variables for all configuration
6. Implement proper logging and monitoring 
import { BaseRepository } from './base.repository';
import {
  AnalysisRecord,
  CreateAnalysisRequest,
  UpdateAnalysisRequest,
  AnalysisFilters,
  AnalysisStats,
} from '../models/analysis.model';
import { v4 as uuidv4 } from 'uuid';

export class AnalysisRepository extends BaseRepository {
  async create(data: CreateAnalysisRequest): Promise<AnalysisRecord> {
    const id = uuidv4();
    const now = new Date();
    
    const sql = `
      INSERT INTO analyses (
        id, url, page_title, analysis, pdf_path, metadata, status, 
        error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const metadata = {
      wordCount: 0,
      analysisTokens: 0,
      pageSize: 0,
      ...data.metadata,
    };

    await this.execute(sql, [
      id,
      data.url,
      data.pageTitle || null,
      '', // analysis starts empty
      null, // pdf_path starts null
      JSON.stringify(metadata),
      'pending',
      null, // error_message starts null
      now.toISOString(),
      now.toISOString(),
    ]);

    const record = await this.findById(id);
    if (!record) {
      throw new Error('Failed to create analysis record');
    }
    return record;
  }

  async findById(id: string): Promise<AnalysisRecord | null> {
    const sql = 'SELECT * FROM analyses WHERE id = ?';
    const row = await this.queryOne(sql, [id]);
    
    if (!row) return null;
    
    return this.mapRowToRecord(row);
  }

  async update(id: string, data: UpdateAnalysisRequest): Promise<AnalysisRecord | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const params: any[] = [];

    if (data.analysis !== undefined) {
      updates.push('analysis = ?');
      params.push(data.analysis);
    }

    if (data.pdfPath !== undefined) {
      updates.push('pdf_path = ?');
      params.push(data.pdfPath);
    }

    if (data.metadata !== undefined) {
      updates.push('metadata = ?');
      params.push(JSON.stringify({ ...existing.metadata, ...data.metadata }));
    }

    if (data.status !== undefined) {
      updates.push('status = ?');
      params.push(data.status);
    }

    if (data.errorMessage !== undefined) {
      updates.push('error_message = ?');
      params.push(data.errorMessage);
    }

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());

    params.push(id);

    const sql = `UPDATE analyses SET ${updates.join(', ')} WHERE id = ?`;
    await this.execute(sql, params);

    return this.findById(id);
  }

  async find(filters: AnalysisFilters = {}): Promise<AnalysisRecord[]> {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    if (filters.url) {
      conditions.push('url LIKE ?');
      params.push(`%${filters.url}%`);
    }

    if (filters.dateFrom) {
      conditions.push('created_at >= ?');
      params.push(filters.dateFrom.toISOString());
    }

    if (filters.dateTo) {
      conditions.push('created_at <= ?');
      params.push(filters.dateTo.toISOString());
    }

    let sql = 'SELECT * FROM analyses';
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
    return rows.map((row: any) => this.mapRowToRecord(row));
  }

  async getStats(): Promise<AnalysisStats> {
    const sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        AVG(
          CASE 
            WHEN status = 'completed' 
            THEN (julianday(updated_at) - julianday(created_at)) * 24 * 60 * 60
            ELSE NULL 
          END
        ) as avg_processing_time
      FROM analyses
    `;

    const row = await this.queryOne(sql);
    
    return {
      total: row.total || 0,
      completed: row.completed || 0,
      failed: row.failed || 0,
      pending: row.pending || 0,
      averageProcessingTime: row.avg_processing_time || 0,
    };
  }

  async delete(id: string): Promise<boolean> {
    const sql = 'DELETE FROM analyses WHERE id = ?';
    const result = await this.execute(sql, [id]);
    return result.changes > 0 || result.rowCount > 0;
  }

  private mapRowToRecord(row: any): AnalysisRecord {
    return {
      id: row.id,
      url: row.url,
      pageTitle: row.page_title,
      analysis: row.analysis,
      pdfPath: row.pdf_path,
      metadata: JSON.parse(row.metadata || '{}'),
      status: row.status,
      errorMessage: row.error_message,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
} 
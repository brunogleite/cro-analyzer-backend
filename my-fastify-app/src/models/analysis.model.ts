export interface AnalysisRecord {
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

export interface CreateAnalysisRequest {
  url: string;
  pageTitle?: string;
  metadata?: Partial<AnalysisRecord['metadata']>;
  status?: AnalysisRecord['status'];
}

export interface UpdateAnalysisRequest {
  analysis?: string;
  pdfPath?: string;
  metadata?: Partial<AnalysisRecord['metadata']>;
  status?: AnalysisRecord['status'];
  errorMessage?: string;
}

export interface AnalysisFilters {
  status?: AnalysisRecord['status'];
  url?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

export interface AnalysisStats {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  averageProcessingTime: number;
} 
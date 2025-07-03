export interface ScrapePageParams {
    url: string;
  }
  
  export interface ScrapePageResult {
    html: string;
    text: string;
  }
  
  export interface AnalyzeWithGPTParams {
    text: string;
    html: string;
    url: string;
  }
  
  export interface GeneratePDFParams {
    htmlString: string;
    outputPath: string;
  }
  
  export interface AnalyzeRequestBody {
    url: string;
  }
  
  export interface AnalyzeResponse {
    analysis: string;
    pdfGenerated: boolean;
  }
  
  export interface CROService {
    scrapePage(params: ScrapePageParams): Promise<ScrapePageResult>;
    analyzeWithGPT(params: AnalyzeWithGPTParams): Promise<string>;
    generateCROReportPDF(params: GeneratePDFParams): Promise<void>;
  }
  
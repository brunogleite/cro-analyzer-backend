import { FastifyInstance } from 'fastify';
import {
  AnalyzeRequestBody,
  AnalyzeResponse,
} from '../../types/cro.types';
import { CreateAnalysisRequest } from '../models/analysis.model';

export default async function croRoutes(fastify: FastifyInstance) {
  fastify.post('/analyze', async (request, reply) => {
    const body = request.body as AnalyzeRequestBody;

    if (!body?.url) {
      return reply
        .code(400)
        .send({ error: 'Missing required parameter: url' });
    }

    try {
      // Create analysis record in database
      const analysisRepo = fastify.db.getAnalysisRepository();
      const analysisRecord = await analysisRepo.create({
        url: body.url,
        status: 'pending',
      });

      // Update status to processing
      await analysisRepo.update(analysisRecord.id, { status: 'processing' });

      const croService = fastify.croService;
      if (!croService) {
        await analysisRepo.update(analysisRecord.id, { 
          status: 'failed',
          errorMessage: 'CRO Service not available'
        });
        return reply
          .code(500)
          .send({ error: 'CRO Service not available' });
      }

      // Scrape the page
      const pageData = await croService.scrapePage({ url: body.url });

      // Update metadata with page information
      await analysisRepo.update(analysisRecord.id, {
        metadata: {
          wordCount: pageData.text.split(' ').length,
          pageSize: pageData.html.length,
          screenshotPath: 'landing-page-snapshot.png',
        }
      });

      // Analyze with GPT
      const analysis = await croService.analyzeWithGPT({
        text: pageData.text,
        html: pageData.html,
        url: body.url,
      });

      // Generate PDF report
      const pdfPath = `reports/CRO_Report_${analysisRecord.id}.pdf`;
      await croService.generateCROReportPDF({
        htmlString: analysis,
        outputPath: pdfPath,
      });

      // Update analysis record with results
      await analysisRepo.update(analysisRecord.id, {
        analysis,
        pdfPath,
        status: 'completed',
        metadata: {
          analysisTokens: analysis.length,
        }
      });

      const response: AnalyzeResponse = {
        analysis,
        pdfGenerated: true,
        analysisId: analysisRecord.id,
      };

      return reply.send(response);

    } catch (error) {
      console.error('Analysis failed:', error);
      
      // Update analysis record with error
      if (fastify.db) {
        const analysisRepo = fastify.db.getAnalysisRepository();
        // Note: We don't have the analysis ID here, so we'd need to track it
        // For now, we'll just log the error
      }

      return reply
        .code(500)
        .send({ 
          error: 'Analysis failed', 
          details: (error as Error).message 
        });
    }
  });

  // Get analysis by ID
  fastify.get('/analysis/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    try {
      const analysisRepo = fastify.db.getAnalysisRepository();
      const analysis = await analysisRepo.findById(id);
      
      if (!analysis) {
        return reply.code(404).send({ error: 'Analysis not found' });
      }
      
      return reply.send(analysis);
    } catch (error) {
      return reply.code(500).send({ 
        error: 'Failed to retrieve analysis',
        details: (error as Error).message 
      });
    }
  });

  // Get all analyses with optional filters
  fastify.get('/analyses', async (request, reply) => {
    const query = request.query as any;
    
    try {
      const analysisRepo = fastify.db.getAnalysisRepository();
      const filters = {
        status: query.status,
        url: query.url,
        limit: query.limit ? parseInt(query.limit) : 50,
        offset: query.offset ? parseInt(query.offset) : 0,
      };
      
      const analyses = await analysisRepo.find(filters);
      return reply.send(analyses);
    } catch (error) {
      return reply.code(500).send({ 
        error: 'Failed to retrieve analyses',
        details: (error as Error).message 
      });
    }
  });

  // Get analysis statistics
  fastify.get('/analyses/stats', async (request, reply) => {
    try {
      const analysisRepo = fastify.db.getAnalysisRepository();
      const stats = await analysisRepo.getStats();
      return reply.send(stats);
    } catch (error) {
      return reply.code(500).send({ 
        error: 'Failed to retrieve statistics',
        details: (error as Error).message 
      });
    }
  });
}

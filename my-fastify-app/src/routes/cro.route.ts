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

    // Check if user is authenticated
    if (!request.user) {
      return reply
        .code(401)
        .send({ error: 'Authentication required' });
    }

    try {
      // Create analysis record in database with user ID
      const analysisRepo = fastify.db.getAnalysisRepository();
      const analysisRecord = await analysisRepo.create({
        url: body.url,
        status: 'pending',
      }, request.user.userId);

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

  // Get analysis by ID (user can only access their own analyses)
  fastify.get('/analysis/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    // Check if user is authenticated
    if (!request.user) {
      return reply
        .code(401)
        .send({ error: 'Authentication required' });
    }
    
    try {
      const analysisRepo = fastify.db.getAnalysisRepository();
      const analysis = await analysisRepo.findById(id);
      
      if (!analysis) {
        return reply.code(404).send({ error: 'Analysis not found' });
      }
      
      // Check if the analysis belongs to the authenticated user
      if (analysis.userId !== request.user.userId) {
        return reply.code(403).send({ error: 'Access denied' });
      }
      
      return reply.send(analysis);
    } catch (error) {
      return reply.code(500).send({ 
        error: 'Failed to retrieve analysis',
        details: (error as Error).message 
      });
    }
  });

  // Get all analyses for the authenticated user with optional filters
  fastify.get('/analyses', async (request, reply) => {
    const query = request.query as any;
    
    // Check if user is authenticated
    if (!request.user) {
      return reply
        .code(401)
        .send({ error: 'Authentication required' });
    }
    
    try {
      const analysisRepo = fastify.db.getAnalysisRepository();
      const filters = {
        userId: request.user.userId, // Only get analyses for the authenticated user
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

  // Get analysis statistics for the authenticated user
  fastify.get('/analyses/stats', async (request, reply) => {
    // Check if user is authenticated
    if (!request.user) {
      return reply
        .code(401)
        .send({ error: 'Authentication required' });
    }
    
    try {
      const analysisRepo = fastify.db.getAnalysisRepository();
      // For now, we'll get stats for all analyses, but in the future
      // we might want to add user-specific stats
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

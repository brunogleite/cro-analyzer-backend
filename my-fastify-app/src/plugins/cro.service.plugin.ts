import { FastifyInstance } from "fastify";
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { CROServiceImpl } from "../services/cro.service";
import { CROService } from "../../types/cro.types";

declare module "fastify" {
  interface FastifyInstance {
    croService: CROService;
  }
}

const croServicePlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const croService = new CROServiceImpl();

  // Decorate fastify with CRO service
  fastify.decorate("croService", croService);
};

export default fp(croServicePlugin, {
  name: "cro-service-plugin",
}); 
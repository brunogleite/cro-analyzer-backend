import { FastifyInstance } from "fastify";
import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

const examplePlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.decorate("utility", () => "Hello from plugin!");
};

export default fp(examplePlugin, {
  name: "example-plugin",
});
    
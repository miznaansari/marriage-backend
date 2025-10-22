import swaggerUi from "swagger-ui-express";
import swaggerJsDoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: { title: "Authentication API", version: "1.0.0" },
  },
  apis: ["./controllers/*.js"], // include swagger comments if added later
};

export const swaggerSpec = swaggerJsDoc(options);
export const swaggerDocs = [swaggerUi.serve, swaggerUi.setup(swaggerSpec)];

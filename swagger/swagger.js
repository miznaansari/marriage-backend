const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const path = require("path");
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "The Clevar API",
      version: "1.0.0",
      description: "API documentation for the Clevar app",
    },
    servers: [
      { url: "http://localhost:5000" },
      { url: "https://api.theclevar.com/" },
      { url: "https://apistag.theclevar.com/" },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    // optional: if most routes require JWT, set global security
    // security: [{ BearerAuth: [] }],
  },
  apis: ["./routes/*.js"],
};


const swaggerSpec = swaggerJsdoc(swaggerOptions);

function swaggerDocs(app) {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  console.log("📄 Swagger docs available at http://localhost:5000/api-docs");
}

module.exports = swaggerDocs;

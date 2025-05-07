import swaggerJSDoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Alkanes API',
      version: '1.0.0',
      description: 'API documentation for Alkanes',
    },
    servers: [
      {
        url: `http://localhost:${process.env.port}`,
        description: 'Development server',
      },
      {
        url: 'https://alkanes-api-signet.idclub.io',
        description: 'Signet server',
      },
      {
        url: 'https://alkanes-api.idclub.io',
        description: 'Mainnet server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/controllers/*.js'], // 指定API路由文件的路径
};

export const swaggerSpec = swaggerJSDoc(options); 
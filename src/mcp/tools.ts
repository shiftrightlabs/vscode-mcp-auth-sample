import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';

/**
 * MCP Tools Implementation
 *
 * These are example MCP tools that require authentication.
 * All tools MUST:
 * - Include Authorization header in requests (OAuth 2.1 Section 5.1.1)
 * - Validate tokens per OAuth 2.1 Section 5.2
 * - Return 401 with WWW-Authenticate for invalid tokens
 */

export const toolsRouter = Router();

/**
 * Example Tool 1: Get User Info
 *
 * This tool returns information about the authenticated user
 * extracted from their access token.
 */
toolsRouter.post('/tools/get-user-info', requireAuth, (req: Request, res: Response) => {
  const user = (req as any).user;

  res.json({
    tool: 'get-user-info',
    result: {
      userId: user.sub,
      email: user.email || user.preferred_username,
      name: user.name,
      tokenIssuer: user.iss,
      tokenAudience: user.aud,
      tokenIssuedAt: new Date(user.iat * 1000).toISOString(),
      tokenExpiresAt: new Date(user.exp * 1000).toISOString(),
    },
    message: 'Successfully retrieved user information',
  });
});

/**
 * Example Tool 2: Echo Message
 *
 * This tool echoes back a message from the request body.
 * Demonstrates a simple authenticated operation.
 */
toolsRouter.post('/tools/echo', requireAuth, (req: Request, res: Response) => {
  const { message } = req.body;
  const user = (req as any).user;

  if (!message) {
    return res.status(400).json({
      error: 'bad_request',
      message: 'Missing required parameter: message',
    });
  }

  res.json({
    tool: 'echo',
    result: {
      originalMessage: message,
      echo: `Echo from ${user.name || user.sub}: ${message}`,
      timestamp: new Date().toISOString(),
    },
    message: 'Message echoed successfully',
  });
});

/**
 * Example Tool 3: Perform Calculation
 *
 * This tool performs a simple calculation.
 * Demonstrates parameter handling with authentication.
 */
toolsRouter.post('/tools/calculate', requireAuth, (req: Request, res: Response) => {
  const { operation, a, b } = req.body;
  const user = (req as any).user;

  // Validate parameters
  if (!operation || a === undefined || b === undefined) {
    return res.status(400).json({
      error: 'bad_request',
      message: 'Missing required parameters: operation, a, b',
    });
  }

  const numA = parseFloat(a);
  const numB = parseFloat(b);

  if (isNaN(numA) || isNaN(numB)) {
    return res.status(400).json({
      error: 'bad_request',
      message: 'Parameters a and b must be valid numbers',
    });
  }

  let result: number;
  switch (operation) {
    case 'add':
      result = numA + numB;
      break;
    case 'subtract':
      result = numA - numB;
      break;
    case 'multiply':
      result = numA * numB;
      break;
    case 'divide':
      if (numB === 0) {
        return res.status(400).json({
          error: 'bad_request',
          message: 'Cannot divide by zero',
        });
      }
      result = numA / numB;
      break;
    default:
      return res.status(400).json({
        error: 'bad_request',
        message: 'Invalid operation. Supported: add, subtract, multiply, divide',
      });
  }

  res.json({
    tool: 'calculate',
    result: {
      operation,
      a: numA,
      b: numB,
      result,
      calculatedBy: user.name || user.sub,
      timestamp: new Date().toISOString(),
    },
    message: 'Calculation completed successfully',
  });
});

/**
 * MCP Tools List Endpoint
 *
 * This endpoint lists all available tools.
 * Per MCP specification, this should be publicly accessible
 * so clients can discover available tools before authentication.
 */
toolsRouter.get('/tools/list', (req: Request, res: Response) => {
  res.json({
    tools: [
      {
        name: 'get-user-info',
        description: 'Retrieves information about the authenticated user',
        requiresAuth: true,
        endpoint: '/tools/get-user-info',
        method: 'POST',
        parameters: [],
      },
      {
        name: 'echo',
        description: 'Echoes back a message with user context',
        requiresAuth: true,
        endpoint: '/tools/echo',
        method: 'POST',
        parameters: [
          {
            name: 'message',
            type: 'string',
            required: true,
            description: 'The message to echo back',
          },
        ],
      },
      {
        name: 'calculate',
        description: 'Performs a mathematical calculation',
        requiresAuth: true,
        endpoint: '/tools/calculate',
        method: 'POST',
        parameters: [
          {
            name: 'operation',
            type: 'string',
            required: true,
            description: 'The operation to perform (add, subtract, multiply, divide)',
          },
          {
            name: 'a',
            type: 'number',
            required: true,
            description: 'First operand',
          },
          {
            name: 'b',
            type: 'number',
            required: true,
            description: 'Second operand',
          },
        ],
      },
    ],
  });
});

/**
 * Test endpoint to verify authentication without calling a specific tool
 */
toolsRouter.get('/tools/test-auth', requireAuth, (req: Request, res: Response) => {
  const user = (req as any).user;

  res.json({
    authenticated: true,
    user: {
      id: user.sub,
      email: user.email || user.preferred_username,
      name: user.name,
    },
    message: 'Authentication successful',
  });
});

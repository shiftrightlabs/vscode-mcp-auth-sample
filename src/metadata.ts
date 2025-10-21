import { Router } from 'express';
import { config } from './config';

/**
 * RFC 9728 - OAuth 2.0 Protected Resource Metadata
 *
 * This endpoint MUST be implemented by MCP servers requiring authentication.
 * It provides metadata about the protected resource (this MCP server) and
 * its relationship with authorization servers.
 */
export const metadataRouter = Router();

/**
 * OAuth 2.0 Protected Resource Metadata Endpoint
 * MUST implement per RFC 9728
 */
metadataRouter.get('/.well-known/oauth-protected-resource', (req, res) => {
  const metadata = {
    // The resource identifier - MUST be the canonical URI of the MCP server
    resource: config.server.url,

    // Authorization servers that can issue tokens for this resource
    // MUST list at least one authorization server
    authorization_servers: [
      `https://login.microsoftonline.com/${config.azure.tenantId}/v2.0`
    ],

    // Supported bearer token methods
    bearer_methods_supported: ['header'],

    // Resource documentation (optional but recommended)
    resource_documentation: `${config.server.url}/docs`,

    // Supported scopes (optional)
    scopes_supported: config.scopes,
  };

  res.json(metadata);
});

/**
 * OAuth 2.0 Authorization Server Metadata (for reference)
 * Azure AD provides this at: /.well-known/openid-configuration
 *
 * Clients MUST follow RFC 8414 to obtain authorization server information
 * from the authorization_servers listed above.
 */

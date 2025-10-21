# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

This is a documentation and sample repository for implementing authentication in Visual Studio Code AI extensions using the Model Context Protocol (MCP). The repository demonstrates OAuth 2.0 authorization flows for MCP servers.

## Architecture Overview

The repository contains documentation explaining:

- **MCP Server Configuration**: How to configure authentication in `mcp.json` files for VS Code
- **OAuth 2.0 Flow**: Complete implementation guide for Authorization Code Grant flow
- **Authentication Provider Integration**: How to integrate external OAuth providers with MCP servers

## Key Concepts

### MCP Server Authentication Configuration

MCP servers requiring authentication are configured in `mcp.json` with:
- `provider`: Unique identifier for the authentication provider
- `scopes`: Array of permission strings the server requests
- `type`: Server type (e.g., "http" for remote servers)
- `url`: Endpoint URL for the MCP server

### OAuth Flow Endpoints

The documented authentication flow includes:
1. `/authorize` - Initiates OAuth flow, redirects to provider
2. `/callback` - Handles OAuth provider redirect, exchanges code for access token
3. Protected tool endpoints that validate Bearer tokens

### Security Considerations

- Access tokens should be securely stored (database or credential store)
- OAuth client credentials should use environment variables
- Token refresh mechanisms should be implemented
- Authorization headers must be validated on protected endpoints

## Documentation Location

Primary documentation: `docs/example1.md` - Complete MCP OAuth implementation guide

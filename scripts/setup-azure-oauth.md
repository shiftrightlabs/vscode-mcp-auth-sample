# Azure OAuth Setup Guide

This guide will help you set up an Azure AD application for OAuth authentication with this MCP server.

## Prerequisites

- Azure CLI installed (`az --version` to check)
- An Azure account with permissions to create app registrations

## Step 1: Login to Azure

```bash
az login
```

## Step 2: Create the Azure AD Application

Run the following command to create an Azure AD application:

```bash
az ad app create \
  --display-name "MCP Auth Sample" \
  --sign-in-audience AzureADMyOrg \
  --web-redirect-uris "http://127.0.0.1:33418" "https://vscode.dev/redirect" "http://localhost:3000/callback"
```

This command will output JSON containing your application details. **Save the `appId` value - this is your CLIENT_ID**.

## Step 3: Create a Client Secret

Replace `<APP_ID>` with the `appId` from Step 2:

```bash
az ad app credential reset --id <APP_ID> --append
```

This will output JSON containing a `password` field. **Save this value - this is your CLIENT_SECRET**.

Note: The secret is only shown once. If you lose it, you'll need to create a new one.

## Step 4: Get Your Tenant ID

```bash
az account show --query tenantId -o tsv
```

**Save this value - this is your TENANT_ID**.

## Step 5: Configure API Permissions (Optional)

If you need to access Microsoft Graph or other APIs:

```bash
# Add Microsoft Graph User.Read permission
az ad app permission add \
  --id <APP_ID> \
  --api 00000003-0000-0000-c000-000000000000 \
  --api-permissions e1fe6dd8-ba31-4d61-89e7-88639da4683d=Scope

# Grant admin consent (if you have admin rights)
az ad app permission grant \
  --id <APP_ID> \
  --api 00000003-0000-0000-c000-000000000000
```

## Step 6: Update Your .env File

Create a `.env` file in the project root with your values:

```
AZURE_CLIENT_ID=<APP_ID from Step 2>
AZURE_CLIENT_SECRET=<password from Step 3>
AZURE_TENANT_ID=<tenantId from Step 4>
PORT=3000
SERVER_URL=http://localhost:3000
```

## Step 7: Expose an API (Required for MCP)

To properly implement OAuth 2.0 Resource Indicators (RFC 8707), you need to expose an API:

```bash
# Set the Application ID URI
az ad app update --id <APP_ID> --identifier-uris "api://<APP_ID>"

# Add a scope
az ad app permission add \
  --id <APP_ID> \
  --api <APP_ID> \
  --api-permissions <SCOPE_ID>=Scope
```

Or do this via the Azure Portal:
1. Go to Azure Portal > Azure Active Directory > App registrations
2. Select your app
3. Go to "Expose an API"
4. Set Application ID URI to `api://<APP_ID>`
5. Add a scope (e.g., "mcp.access" with admin and user consent)

## Verification

You can verify your app registration:

```bash
az ad app show --id <APP_ID>
```

## Common Azure CLI Commands

```bash
# List all app registrations
az ad app list --show-mine

# Show app details
az ad app show --id <APP_ID>

# Update redirect URIs
az ad app update --id <APP_ID> --web-redirect-uris "http://127.0.0.1:33418" "https://vscode.dev/redirect" "http://localhost:3000/callback"

# Delete app (if needed)
az ad app delete --id <APP_ID>
```

## Next Steps

After setting up Azure OAuth:
1. Ensure your `.env` file is configured correctly
2. Run `npm run dev` to start the server
3. Configure your `mcp.json` in VS Code (see main README.md)
4. Test the OAuth flow

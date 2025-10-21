# Azure AD Public Client Setup for PKCE

This guide explains how to configure your Azure AD application as a **public client** to use PKCE (Proof Key for Code Exchange) instead of client secrets.

## Why Public Client?

Your MCP server runs **client-side in VS Code**, distributed to users like a React app or mobile app. This means:

- ❌ **Cannot use client secrets** - Code is visible to users who can extract secrets
- ✅ **Must use PKCE** - OAuth 2.1 requires PKCE for public clients
- ✅ **No shared secrets** - Each OAuth flow generates unique cryptographic proof

## Security Comparison

| Pattern | Client Secret | PKCE |
|---------|--------------|------|
| **Security Model** | Confidential (server-side) | Public (client-side) |
| **Suitable For** | Backend servers | React, mobile, VS Code extensions |
| **Secret Storage** | Server environment variables | No secrets needed |
| **Flow Protection** | Shared secret | Unique per-flow cryptographic proof |
| **OAuth 2.1 Status** | Optional for confidential clients | **Required** for public clients |

## Azure AD Configuration Steps

### Option 1: Using Azure Portal (GUI)

1. **Navigate to your app registration**
   - Go to https://portal.azure.com
   - Navigate to **Azure Active Directory** → **App registrations**
   - Select your MCP app (or create a new one)

2. **Configure as Public Client**
   - Go to **Authentication** tab
   - Under **Platform configurations**, click **Add a platform**
   - Select **Mobile and desktop applications**
   - Add redirect URI: `http://localhost:3000/callback`
   - Under **Advanced settings** → **Allow public client flows**: Set to **Yes**
   - Click **Save**

3. **Remove Client Secret** (if you have one)
   - Go to **Certificates & secrets** tab
   - Delete any existing client secrets
   - You don't need them anymore!

4. **Verify Configuration**
   - Go to **Manifest** tab
   - Find `"allowPublicClient"`: should be `true`
   - Find `"oauth2AllowImplicitFlow"`: should be `false` (PKCE doesn't need implicit flow)

### Option 2: Using Azure CLI (Recommended)

```bash
# 1. Get your app ID
APP_ID="your-app-id-here"

# 2. Configure as public client
az ad app update \
  --id $APP_ID \
  --set publicClient.redirectUris='["http://localhost:3000/callback"]' \
  --is-fallback-public-client true

# 3. Verify configuration
az ad app show --id $APP_ID --query '{publicClient: publicClient, isFallbackPublicClient: isFallbackPublicClient}'
```

### Option 3: Complete Setup Script

```bash
#!/bin/bash

# Azure AD Public Client Setup Script

echo "🔐 Setting up Azure AD Public Client for MCP with PKCE"

# Login to Azure
echo "Logging in to Azure..."
az login

# Create new public client app
echo "Creating public client app registration..."
APP_JSON=$(az ad app create \
  --display-name "MCP Auth Sample (Public Client)" \
  --sign-in-audience AzureADMyOrg \
  --is-fallback-public-client true \
  --public-client-redirect-uris "http://localhost:3000/callback" "http://127.0.0.1:3000/callback")

APP_ID=$(echo $APP_JSON | jq -r '.appId')
echo "✅ App created with ID: $APP_ID"

# Get tenant ID
TENANT_ID=$(az account show --query tenantId -o tsv)
echo "✅ Tenant ID: $TENANT_ID"

# Create .env file
echo "Creating .env file..."
cat > .env <<EOF
# Azure AD Public Client Configuration (PKCE - No Secret Required)
AZURE_CLIENT_ID=$APP_ID
AZURE_TENANT_ID=$TENANT_ID

# Server Configuration
PORT=3000
SERVER_URL=http://localhost:3000

# NOTE: AZURE_CLIENT_SECRET is no longer needed - using PKCE!
EOF

echo "✅ .env file created"

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Summary:"
echo "  App ID (Client ID): $APP_ID"
echo "  Tenant ID: $TENANT_ID"
echo "  Client Type: Public Client (PKCE)"
echo "  Redirect URI: http://localhost:3000/callback"
echo ""
echo "Next steps:"
echo "  1. npm install"
echo "  2. npm run build"
echo "  3. npm start"
echo ""
```

## Configuration Files

### .env (Updated - No Secret!)

```env
# Azure AD Public Client Configuration
AZURE_CLIENT_ID=your-app-id-here
AZURE_TENANT_ID=your-tenant-id-here

# Server Configuration
PORT=3000
SERVER_URL=http://localhost:3000

# NOTE: AZURE_CLIENT_SECRET is no longer needed!
# This is a PUBLIC CLIENT using PKCE for security.
```

### .env.example (Updated)

Update your `.env.example` file:

```env
# Azure AD Public Client Configuration (PKCE)
# No client secret required for public clients
AZURE_CLIENT_ID=
AZURE_TENANT_ID=

# Server Configuration
PORT=3000
SERVER_URL=http://localhost:3000
```

## How PKCE Works (Technical Details)

### 1. Authorization Request (/authorize)

```typescript
// Server generates random code_verifier
const codeVerifier = crypto.randomBytes(32).toString('base64url');
// Example: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

// Creates SHA256 hash as code_challenge
const codeChallenge = crypto
  .createHash('sha256')
  .update(codeVerifier)
  .digest('base64url');
// Example: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

// Sends challenge to Azure AD (verifier stays on server)
authUrl.searchParams.append('code_challenge', codeChallenge);
authUrl.searchParams.append('code_challenge_method', 'S256');
```

### 2. Token Exchange (/callback)

```typescript
// Send the verifier to prove we started the flow
const tokenParams = {
  client_id: 'your-client-id',
  code: 'authorization-code-from-azure',
  code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
  // ❌ NO client_secret
  grant_type: 'authorization_code',
};

// Azure AD verifies: SHA256(code_verifier) === code_challenge
// If match → issues access token
```

### 3. Security Properties

- **Unique per flow**: Each authorization generates a new random verifier
- **One-time use**: Verifier is deleted after token exchange
- **Time-limited**: Stored verifier expires after 10 minutes
- **Cannot be intercepted**: Only the challenge (hash) is transmitted
- **Cryptographically secure**: Uses SHA256 and 32 random bytes

## Troubleshooting

### Error: "AADSTS7000218: The request body must contain the following parameter: 'client_secret or client_assertion'"

**Cause**: Your Azure AD app is still configured as a confidential client.

**Solution**:
```bash
# Enable public client flows
az ad app update --id $APP_ID --is-fallback-public-client true
```

### Error: "invalid_grant: PKCE verification failed"

**Cause**: Code verifier doesn't match the code challenge sent in authorization.

**Common reasons**:
1. Server restarted between /authorize and /callback (verifier lost)
2. OAuth flow took > 10 minutes (verifier expired)
3. Multiple authorization attempts with same state parameter

**Solution**: Try the OAuth flow again from the beginning.

### Error: "Missing code_verifier parameter"

**Cause**: Token request missing the `code_verifier` parameter.

**Solution**: Check that your `/callback` endpoint is sending `code_verifier` in the token request, not `client_secret`.

## Migration from Confidential Client

If you're migrating from a confidential client (with client_secret):

1. **Backup your client secret** (in case you need to rollback)
2. **Update Azure AD app** to public client (see above)
3. **Update code** to use PKCE (already done in this PR)
4. **Update .env** to remove `AZURE_CLIENT_SECRET`
5. **Test the flow** end-to-end
6. **Delete client secret** from Azure AD once confirmed working

## References

- [RFC 7636 - PKCE](https://datatracker.ietf.org/doc/html/rfc7636)
- [OAuth 2.1 - Section 4.1](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-10#section-4.1)
- [Microsoft: Public client and confidential client applications](https://learn.microsoft.com/en-us/azure/active-directory/develop/msal-client-applications)
- [Microsoft: PKCE in Azure AD](https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow#request-an-authorization-code)

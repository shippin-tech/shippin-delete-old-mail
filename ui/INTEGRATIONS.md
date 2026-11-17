# Connected shippinTECH workspace

The local app's **Connections** page is `/integrations`. Signed-in people can reach
Mail, Calendar, Contacts, Drive, Docs and Connections from the main navigation.
This is pre-release software: test with disposable accounts and synthetic files.

## What works in this slice

| Workflow | Google Workspace | Microsoft 365 |
| --- | --- | --- |
| Connect an account | Existing server OAuth connection | MSAL popup, delegated Microsoft Graph access |
| Browse folders and search | Google Drive | The account's OneDrive |
| Open the original document | Google's editor in another tab | Microsoft's editor in another tab |
| Download | Files; export Docs, Sheets and Slides to supported Office/PDF formats | Files, including Word, Excel and PowerPoint |
| Copy into shippinTECH Drive | Explicit copy to `From Google Workspace` | Explicit copy to `From Microsoft 365` |
| Disconnect | Existing server disconnect and Google revocation | Clear the connection in this browser tab |

Copies are separate files, not synchronization. Each transfer is bounded to 100 MB.
The existing `/files?view=google` workflow remains available and supports copying
shippinTECH files back to Google. This new hub does not write to Microsoft.

Outlook/Gmail mail aggregation, calendar synchronization, SharePoint site discovery,
OneNote packages, embedded Office editing, continuous sync and background jobs are
not implemented here. Microsoft consent and Google consent still need verification
with real app registrations; mocks establish behavior, not provider approval.

## Try locally

From `ui/`, install dependencies with `npm ci`, then run `npm run dev`. Sign in to
the local shippinTECH stack and open `/integrations`. The existing Vite proxy expects
the backend on `127.0.0.1:8080`; use the repository's local-stack configuration for
your environment. The page still opens when a provider is not configured and says
which connection needs setup.

### Microsoft registration

1. Register an application in Microsoft Entra. Choose the supported account types
   appropriate to your organisation (one tenant, multiple tenants, or personal
   Microsoft accounts too).
2. Add a **Single-page application (SPA)** redirect URI matching the exact origin
   where you open shippinTECH, followed by `/connect/microsoft/callback`. For the
   default local Vite server this is
   `http://localhost:5173/connect/microsoft/callback`. `localhost` and `127.0.0.1`
   are different origins; register the one you actually use.
3. Enable delegated Microsoft Graph `Files.Read`. An organisation's policy may
   require administrator consent. This connector does not request `Mail.Read`,
   `Calendars.ReadWrite`, application-wide permissions, or file-write permissions.
   MSAL also uses its standard identity scopes for sign-in/token renewal.
4. Put the public application ID and tenant in `ui/.env.local`:

   ```dotenv
   VITE_MICROSOFT_CLIENT_ID=your-application-client-id
   VITE_MICROSOFT_TENANT_ID=your-directory-tenant-id
   ```

   `common` can be used for the tenant when the app registration supports those
   account types. These two values are public configuration, included in the browser
   bundle. No client secret is required for this SPA flow.
5. Restart Vite (or rebuild static assets). Open Connections and choose
   **Connect Microsoft 365**. Complete sign-in and consent in Microsoft's popup.

The SDK is loaded only when Microsoft is configured. Its token cache uses memory,
so refreshing or closing the tab requires reconnecting. A shippinTECH sign-out or
account change clears this connection. Disconnect does not sign the user out of
other Microsoft apps or revoke tenant consent; the UI explains that distinction.
Microsoft access tokens are used by the browser for Graph calls and are never
sent to the shippinTECH server. Download URLs are fetched without the Graph bearer
token and are not stored. Copying into shippinTECH intentionally sends the selected
file's bytes to its Drive API under the current shippinTECH session.

### Google registration

Use the existing Google setup in `deploy/README.md` (the
`shippin.tech_GOOGLE_*` settings). The hub uses that same server-side connection;
it does not create a second token store. Existing provider consent determines its
permissions. Google tokens remain on the server as described in `KEYS.md`.

## Add another provider

Implement `FileProvider` in `src/lib/integrations/types.ts` and register it in
`providers.ts`. The provider supplies status, explicit connect/disconnect, list/search
with opaque pagination, and a bounded file read. The browser consumes only normalized
metadata; it never receives SDK account objects or credentials through this interface.

Keep provider authentication and errors inside the adapter. Normalize a file reference
as both item ID and drive ID when necessary; IDs alone are not globally unique.
Only return safe HTTPS links for opening originals. Validate provider continuation
origins before attaching bearer tokens. Use the bounded download helper for unknown
file lengths. A new provider must pass its protocol/authorization tests and the shared
browser workflows before being advertised as available.

`Connections.svelte` owns browsing and user actions. `transfers.ts` is the only bridge
from a connected file into shippinTECH's existing Drive adapter. Replacing the mail
engine later changes that destination adapter, not Microsoft Graph or the browser
contract. The current Google backend and own-Drive adapter still depend on the engine;
this slice does not establish complete engine independence.

## Verification

```text
npm run check
npm test
npm run test:browser -- e2e/integrations.spec.ts
npm run build
```

Unit checks cover Graph origin restrictions, pagination, search escaping, file
normalization, binary preservation, transfer limits, permission errors and account
changes during authentication. Browser checks use mocked Google and Drive endpoints
to exercise the assembled screen, copy/export, disconnect, errors, phone layout,
accessibility and the isolated Microsoft callback. They do not sign in to live providers.

Provider references:

- [MSAL initialization](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/initialization)
- [MSAL cache behavior](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/caching)
- [Graph folder contents](https://learn.microsoft.com/en-us/graph/api/driveitem-list-children?view=graph-rest-1.0)
- [Graph file search](https://learn.microsoft.com/en-us/graph/api/driveitem-search?view=graph-rest-1.0)
- [Downloading files in JavaScript](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0#downloading-files-in-javascript-apps)

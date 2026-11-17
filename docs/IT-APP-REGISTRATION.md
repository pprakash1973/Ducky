# Ducky – Microsoft Graph app registration (for IT)

Ducky works without this: with no client ID it drives the user's desktop Outlook over COM.
Register an app only if you want Ducky to use Microsoft Graph (works without desktop Outlook, e.g. new Outlook / web).

## Registration
- Entra ID > App registrations > **New registration**, single tenant, name "Ducky".
- Platform: **Mobile and desktop applications**, redirect URI `http://localhost` (loopback, public client).
- Enable **Allow public client flows**. No client secret is used or needed.

## Delegated permissions (no application permissions)
| Permission | Why |
|---|---|
| `User.Read` | Sign-in |
| `Mail.ReadWrite` | Read Sent Items; create **drafts** (Ducky never calls send) |
| `Calendars.Read` | Read the last week's meetings |

All three are user-consentable by default. If user consent is disabled in the tenant, grant admin consent.

## Give the user the IDs
Enter the **Application (client) ID** and **Directory (tenant) ID** in Ducky tray menu > Settings.

## What data leaves the machine
- Email subjects, recipients, meeting titles, edited file names and dates are sent to the Anthropic API to write the report.
- Email bodies and file contents are never read.
- Tool actions are logged locally (no email bodies) in `%APPDATA%\Ducky\audit.log`.
- The Anthropic API key and Graph tokens are stored encrypted with Windows DPAPI.

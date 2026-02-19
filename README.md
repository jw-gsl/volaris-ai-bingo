# Volaris AI Bingo

Suite of interactive web tools for the **CSI Revenue Signals Product Accelerator** — a 4-day immersive program run by Volaris Business Transformation in Denver, CO.

All apps are single-file HTML (no build step), hosted on AWS via S3 + CloudFront, with DynamoDB-backed Lambda APIs where needed.

## Apps

### [Aha Moment Bingo](aha-moment-bingo/)
Interactive 5×5 bingo card where accelerator participants mark "aha moments" as they learn. Organized by track (Product, R&D, Leadership) with 4-day support, a reflection journal, token rewards, bingo detection with confetti, and dark mode. Track is set at onboarding and cards are generated automatically on load.

**Live:** [d3c9oon0ixjih5.cloudfront.net/aha-moment-bingo.html](https://d3c9oon0ixjih5.cloudfront.net/aha-moment-bingo.html)

**Header layout:** Compact 2-row header (logo bar + mountains) with the title as a single teal subheading. Tagline, event-info chips, and track-filter buttons removed. Light/Dark and Sound controls moved to the footer.

**Dev shortcut:** `Ctrl+Shift+.` cycles Landing → Day 1 → Day 2 → Day 3 → Day 4 → Landing (useful for testing before the event goes live on 3 March 2026).

### [Bullshit Bingo](bullshit-bingo/)
The original satirical bingo card poking fun at common AI adoption buzzwords and excuses ("We need a strategy first", "AI will replace us all", "Let's form a committee"). Each cell has a witty rebuttal in the side panel.

### [Mindset Tracker](mindset-tracker/)
Facilitator-facing assessment tool for tracking participant mindset progression across the 4-day program. Based on Chris Wildsmith's framework: **Toxic → Talker → Action → Driver**. Features multi-rater consensus, movement tracking, CSV import, audit logging, and per-participant notes. Secured with AWS Cognito.

## AWS Infrastructure

| Resource | Value |
|----------|-------|
| **Account** | 354918379520 |
| **Region** | us-east-1 |
| **CLI Profile** | `VolarisAI` |
| **S3 Bucket** | `csi-bingo-app` |
| **CloudFront** | `EJEVF4NEXEJDI` |
| **Cost Tag** | `Project=Volaris-bingo` |

See each app's `AWS-INFRASTRUCTURE.md` for full resource details and deployment commands.

## Quick Deploy

```bash
# Login
aws sso login --profile VolarisAI

# Upload an app
aws s3 cp aha-moment-bingo/aha-moment-bingo.html \
  s3://csi-bingo-app/aha-moment-bingo.html \
  --content-type "text/html" --profile VolarisAI

# Invalidate CDN cache
aws cloudfront create-invalidation \
  --distribution-id EJEVF4NEXEJDI \
  --paths "/*" --profile VolarisAI
```

## Tech Stack

- **Frontend:** Pure HTML/CSS/JS (single-file, no framework, no build step)
- **Styling:** Volaris branding (navy `#0B2340`, lime `#BFD731`, teal `#008AB0`), Barlow font, dark mode
- **Hosting:** S3 + CloudFront (HTTPS, OAC)
- **API:** API Gateway (HTTP) + Lambda (Node.js 20.x)
- **Database:** DynamoDB (on-demand billing)
- **Auth:** AWS Cognito (Mindset Tracker only)

## Repo Structure

```
volaris-ai-bingo/
├── aha-moment-bingo/
│   ├── aha-moment-bingo.html    # Participant bingo app
│   ├── lambda/index.mjs         # Journal API (GET/POST/DELETE)
│   ├── AWS-INFRASTRUCTURE.md    # Full AWS resource docs
│   └── IMPLEMENTATION_PLAN.md   # Planned UX improvements
├── bullshit-bingo/
│   └── bullshit-bingo.html      # Satirical bingo card
├── mindset-tracker/
│   ├── mindset-tracker.html     # Facilitator assessment app
│   ├── lambda/index.mjs         # 7-endpoint API (4 DynamoDB tables)
│   ├── AWS-INFRASTRUCTURE.md    # AWS resource docs
│   └── MINDSET-TRACKER-HANDOVER.md  # Requirements & design doc
└── README.md
```

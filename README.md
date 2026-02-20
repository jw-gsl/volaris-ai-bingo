# Volaris AI Bingo

Suite of interactive web tools for the **CSI Revenue Signals Product Accelerator** — a 4-day immersive program run by Volaris Business Transformation in Denver, CO.

All apps are single-file HTML (no build step), hosted on AWS via S3 + CloudFront, with DynamoDB-backed Lambda APIs where needed.

## Apps

### [Aha Moment Bingo](aha-moment-bingo/)
Interactive 5x5 bingo card where accelerator participants mark "aha moments" as they learn. Organised by track (Product, R&D, Leadership, General) with 4-day support, a reflection journal, token rewards, bingo detection with confetti, and dark mode.

**Live:** [d3c9oon0ixjih5.cloudfront.net/aha-moment-bingo.html](https://d3c9oon0ixjih5.cloudfront.net/aha-moment-bingo.html)

### [Bullshit Bingo](bullshit-bingo/)
The original satirical bingo card poking fun at common AI adoption buzzwords and excuses ("We need a strategy first", "AI will replace us all", "Let's form a committee"). Each cell has a witty rebuttal in the side panel.

### [Mindset Tracker](mindset-tracker/)
Facilitator-facing assessment tool for tracking participant mindset progression across the 4-day accelerator program. Based on Chris Wildsmith's framework: **Toxic > Talker > Action > Driver**.

**Live:** [d1lqfmgriiolzl.cloudfront.net/mindset-tracker.html](https://d1lqfmgriiolzl.cloudfront.net/mindset-tracker.html)

**Key features:**
- **Board view** — consensus cards per VBU with movement arrows (day-over-day), level filtering, and colour-coded mindset badges
- **Assess view** — card-based assessment grid with search, VBU/track filters, unassessed/all toggle, skip with two-click confirmation, and level toggle-off
- **AI Maturity Level** — dedicated AI tab (Level 0-3) with colour-coded cards, level picker modal, and stats breakdown
- **Journey view** — interactive grid showing each participant's progression across all 4 days with expand/collapse detail
- **Audit log** — full history of all assessment changes with mobile card layout
- **Admin page** — participant CRUD with edit/delete, CSV import/export, VBU management (add/edit/rename/delete), facilitator management (create/delete/reset password/set password)
- **Comprehensive CSV export** — one row per participant with consensus per day, individual assessor ratings, AI levels, and notes
- **Multi-rater consensus** — weighted average across facilitators with automatic level calculation
- **Mobile responsive** — optimised for iPhone 12 Pro with column hiding, card layouts, and sticky headers
- **Dark/light mode** — full theme support with Denver mountain scene background
- **Cognito authentication** — JWT-secured API with facilitator user pool

## AWS Infrastructure

### Shared
| Resource | Value |
|----------|-------|
| **Account** | 354918379520 |
| **Region** | us-east-1 |
| **CLI Profile** | `VolarisAI` |
| **Cost Tag** | `Project=Volaris-bingo` |

### Aha Moment Bingo
| Resource | Value |
|----------|-------|
| **S3 Bucket** | `csi-bingo-app` |
| **CloudFront** | `EJEVF4NEXEJDI` |

### Mindset Tracker
| Resource | Value |
|----------|-------|
| **S3 Bucket** | `mindset-tracker-app` |
| **CloudFront** | `E3TXPHY6AGBVX4` |
| **API Gateway** | `vxm4x8vt1b` (mindset-tracker-api) |
| **Lambda** | `mindset-tracker` |
| **Cognito** | `us-east-1_AatsAsuay` |
| **DynamoDB Tables** | `mindset-users`, `mindset-assessments`, `mindset-audit-log`, `mindset-notes`, `mindset-vbus` |

See each app's `AWS-INFRASTRUCTURE.md` for full resource details and deployment commands.

## Quick Deploy

```bash
# Login
aws sso login --profile VolarisAI

# Deploy Aha Moment Bingo
aws s3 cp aha-moment-bingo/aha-moment-bingo.html \
  s3://csi-bingo-app/aha-moment-bingo.html \
  --content-type "text/html" --profile VolarisAI
aws cloudfront create-invalidation \
  --distribution-id EJEVF4NEXEJDI \
  --paths "/aha-moment-bingo.html" --profile VolarisAI

# Deploy Mindset Tracker (frontend)
aws s3 cp mindset-tracker/mindset-tracker.html \
  s3://mindset-tracker-app/mindset-tracker.html \
  --content-type "text/html" --profile VolarisAI
aws cloudfront create-invalidation \
  --distribution-id E3TXPHY6AGBVX4 \
  --paths "/mindset-tracker.html" --profile VolarisAI

# Deploy Mindset Tracker (Lambda)
cd mindset-tracker/lambda && zip -j /tmp/lambda.zip index.mjs
aws lambda update-function-code \
  --function-name mindset-tracker \
  --zip-file fileb:///tmp/lambda.zip \
  --profile VolarisAI --region us-east-1

# Run cost analysis
./mindset-tracker/cost-analysis.sh          # Current month
./mindset-tracker/cost-analysis.sh 2026-02  # Specific month
```

## Tech Stack

- **Frontend:** Pure HTML/CSS/JS (single-file, no framework, no build step)
- **Styling:** Volaris branding (navy `#0B2340`, lime `#BFD731`, teal `#008AB0`), Barlow font, dark mode
- **Hosting:** S3 + CloudFront (HTTPS, OAC)
- **API:** API Gateway (HTTP v2) + Lambda (Node.js 20.x ESM)
- **Database:** DynamoDB (on-demand billing, 5 tables)
- **Auth:** AWS Cognito (Mindset Tracker only)
- **Cost Tracking:** All resources tagged `Project=Volaris-bingo`, cost analysis script included

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
│   ├── mindset-tracker.html     # Facilitator assessment app (single-file)
│   ├── lambda/index.mjs         # 24-endpoint API (5 DynamoDB tables + Cognito)
│   ├── cost-analysis.sh         # AWS cost reporting & tag verification
│   ├── AWS-INFRASTRUCTURE.md    # AWS resource docs
│   └── MINDSET-TRACKER-HANDOVER.md  # Requirements & design doc
└── README.md
```

## Mindset Tracker API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/participants` | List all participants |
| POST | `/participants` | Add/update participant |
| DELETE | `/participants/{email}` | Remove participant |
| POST | `/participants/ai-level` | Set AI maturity level (0-3) |
| POST | `/participants/import` | Bulk CSV import |
| GET | `/assessments` | Get assessments (by participant + day) |
| POST | `/assessments` | Submit assessment |
| DELETE | `/assessments` | Remove assessment (skip) |
| GET | `/consensus` | Get consensus data for a day |
| GET | `/audit-log` | Assessment change history |
| GET | `/notes/{id}` | Get participant notes |
| POST | `/notes` | Save note |
| GET | `/vbus` | List VBUs |
| POST | `/vbus` | Add VBU |
| PUT | `/vbus/{id}` | Rename VBU (updates all participants) |
| DELETE | `/vbus/{id}` | Remove VBU |
| GET | `/facilitators` | List Cognito facilitators |
| POST | `/facilitators` | Create facilitator |
| DELETE | `/facilitators/{username}` | Remove facilitator |
| POST | `/facilitators/reset-password` | Send password reset email |
| POST | `/facilitators/set-password` | Set password directly |
| POST | `/admin/reset-assessments` | Clear all assessments/notes/audit |
| POST | `/admin/reset-all` | Factory reset (includes participants) |

# Mindset Tracker App — Handover Document

## Context & Background

This app is a companion tool for the **CSI Revenue Signals Product Accelerator** — a 4-day immersive program run by Volaris Business Transformation. The accelerator runs across three tracks (Product, R&D, Leadership) in Denver, CO.

### Chris Wildsmith's Assessment Framework

From the planning transcript (2026-02-03), Chris outlined a daily participant assessment model with four levels:

| Level | Label | Description |
|-------|-------|-------------|
| 1 | **Toxic** | Disengaged, negative, dismissive. Could be vocal ("this is all rubbish") or silent/withdrawn. Not contributing. |
| 2 | **Talker** | Talks about doing things but doesn't act. "Yeah we were thinking about that", "We'll do some heavy lifting next year." All talk, no output. |
| 3 | **Action** | Does things when directed. Completes tasks in the room. But shows no evidence of going beyond what's asked — stops when facilitators stop pushing. |
| 4 | **Driver** | Self-motivated. Builds after hours. Returns with new ideas unprompted. Engaged intrinsically. Wants to learn more. This is the target state. |

### Program Goals
- Move people from Talker → Action → Driver over the 4 days
- Minimum target: **at least one Driver per company/team** by end of week
- Daily assessment by facilitators to track movement
- Feed assessment data back to portfolio leaders post-program

### Key Quotes from Chris
- "What I'm really going to want people to do is for each team, assess the people"
- "At the end of every day we can assess each team and just see where people are"
- "Then what you can do is then test people the next day — I need to move them from talker to action, or action to driver"
- "If they only do stuff in the room and after that all they want to do is just have a laugh... they're just doing what they're told"
- "You know the people who are in the zone, they're just doing it non-stop, they want to know more"

---

## Decisions (Resolved)

| Topic | Decision |
|-------|----------|
| **Visibility** | Facilitators only — no participant login |
| **Multi-rater** | Independent ratings per facilitator; dashboard shows average/consensus with drill-down to individual ratings |
| **Sessions** | Denver only |
| **Attendee data** | Admin flow + CSV import with downloadable template |
| **Auth** | AWS Cognito |
| **Domain** | CloudFront default URL |

---

## App Requirements

### Core Features

1. **Participant Registry**
   - Each participant has: name, email, VBU (company/business unit from dropdown)
   - Admin flow to add/remove participants manually
   - CSV import with downloadable template for bulk upload
   - James will provide attendee list to populate via CSV

2. **Daily Mindset Assessment**
   - Facilitators can rate each participant daily (Toxic / Talker / Action / Driver)
   - Each facilitator rates independently — multiple ratings per participant per day
   - Dashboard shows average/consensus level with drill-down to individual facilitator ratings
   - Notes field per assessment (free text — what did they observe?)
   - Assessment is per-person, per-day (Day 1-4)
   - Visual journey view showing movement over 4 days

3. **Dashboard / Overview**
   - See all participants at a glance with current consensus mindset level
   - Filter by VBU/company, by track (Product/R&D/Leadership), by day
   - Visual distribution: how many Toxic/Talker/Action/Driver per team
   - Highlight movement (who improved, who regressed, who's stuck)

4. **Audit Log**
   - Track who assessed whom and when
   - Every assessment change is logged with timestamp and assessor name
   - Facilitators can see each other's assessments

5. **Notes / Observations**
   - Per-person notes that persist across days
   - Facilitators can add observations at any time
   - Notes visible to all facilitators

6. **User Roles**
   - **Facilitators**: Can assess, view all data, add notes
   - **Admins**: Can manage user list, import CSV, export data

### Nice-to-Have
- Export to CSV/PDF for post-program reporting to portfolio leaders
- Summary report generator per company/VBU
- "End of week test" tracking against Chris's four criteria:
  1. Do they understand AI opportunities?
  2. Do they demonstrate disruptive thinking?
  3. Are they operating as a Driver?
  4. Can they show how to apply AI daily in their context?

---

## Technical Architecture

### Existing AWS Infrastructure (Account: 354918379520, Profile: VolarisAI)

The Aha Moment Bingo app is already deployed on this AWS account. Use the same infrastructure pattern:

| Resource | Details |
|----------|---------|
| **AWS Account** | 354918379520 |
| **Region** | us-east-1 |
| **AWS CLI Profile** | VolarisAI |
| **SSO Login** | `aws sso login --profile VolarisAI` |
| **SSO URL** | https://volarisai.awsapps.com/start/ |
| **Tag** | `Project=Volaris-bingo` (use for cost tracking) |

### Recommended Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Frontend** | Single HTML file (or small SPA) | Same pattern as bingo app — pure HTML/CSS/JS, no build step |
| **Hosting** | S3 + CloudFront | Same bucket or new bucket, same pattern |
| **Auth** | AWS Cognito | User pool for facilitators only |
| **API** | API Gateway (HTTP) + Lambda | Secured with Cognito authorizer |
| **Database** | DynamoDB | Tables for: users, assessments, audit_log, notes |
| **Cost Tag** | `Project=Volaris-bingo` | Keep all resources under same tag for cost visibility |

### Existing Bingo Infrastructure (for reference)

```
S3 Bucket:          csi-bingo-app
CloudFront:         EJEVF4NEXEJDI → d3c9oon0ixjih5.cloudfront.net
DynamoDB:           csi-bingo-journal
Lambda:             csi-bingo-journal
API Gateway:        qqkykyeiol → https://qqkykyeiol.execute-api.us-east-1.amazonaws.com
IAM Role:           csi-bingo-journal-lambda-role
```

### Suggested DynamoDB Tables

**mindset-users**
- PK: `userId` (string — email)
- Attributes: name, email, vbu, track, role (facilitator/admin)

**mindset-assessments**
- PK: `participantId` (string — email)
- SK: `day#assessorId` (e.g., "D1#james.whiting")
- Attributes: level (toxic/talker/action/driver), notes, timestamp, assessorName

**mindset-audit-log**
- PK: `participantId`
- SK: `timestamp`
- Attributes: action, assessorId, assessorName, previousLevel, newLevel, notes

**mindset-notes**
- PK: `participantId`
- SK: `timestamp`
- Attributes: authorId, authorName, note

---

## Design & Styling Guide

### Volaris Branding (match bingo app exactly)

```css
--navy: #0B2340;      /* Primary dark */
--lime: #BFD731;      /* Primary accent */
--teal: #008AB0;      /* Secondary accent */
--amber: #F59E0B;     /* Warning / Leadership track */
--dark-gray: #464646; /* Body text */
--off-white: #FAF9F6; /* Light background */
```

### Mindset Level Colors (suggested)
```css
Toxic:   #EF4444 (red)
Talker:  #F59E0B (amber)
Action:  #008AB0 (teal)
Driver:  #BFD731 (lime/green)
```

### Track Colors (same as bingo)
```css
Leadership: #F59E0B (amber)
Product:    #008AB0 (teal)
R&D:        #BFD731 (lime)
```

### Font
- Google Fonts: `Barlow` family (weights: 400, 500, 600, 700, 800, 900)
- Same as bingo app

### Theme
- Denver mountain theming (same as bingo)
- Dark mode support (same CSS custom property pattern)
- Volaris logo: `https://www.volarisgroup.com/wp-content/uploads/2024/09/Logo-2.png`

---

## VBU / Company List

*(James to provide via CSV import)*

Companies expected at Denver:
- ~10-11 companies for North America session

Companies to be added as dropdown options. James will supply the full list with attendee names via CSV.

---

## Facilitators

| Name | Role |
|------|------|
| James Whiting | Product Track Lead |
| Ellen | Product Track |
| Hom | Product Track (floating) |
| Ian | Dev Track Lead |
| Jeff | Facilitator |
| Riley | Facilitator |
| Jeevan | Facilitator |
| Chris Wildsmith | Program Director |

---

## Key User Flows

### Facilitator Flow
1. Log in (Cognito) → Dashboard showing all participants grouped by VBU
2. Select a day (D1/D2/D3/D4)
3. For each participant: set mindset level + add notes
4. View journey: see each person's D1→D2→D3→D4 progression
5. End-of-day: review team distributions, identify who needs attention tomorrow

### Admin Flow
1. Manage user list (add/remove participants)
2. Import participants via CSV (downloadable template provided)
3. Export assessment data as CSV
4. Generate summary reports per VBU

---

## Deployment

Deploy to the same AWS account using the same pattern:

```bash
# Login
aws sso login --profile VolarisAI

# Create resources (Cognito, S3, DynamoDB tables, Lambda, API Gateway)
# Tag everything with Project=Volaris-bingo

# Upload to S3, set up CloudFront
```

---

## File Location

```
/Users/jameswhiting/_git/volaris-ai-bingo/
├── aha-moment-bingo/
│   └── aha-moment-bingo.html    # Aha moment bingo (deployed)
├── bullshit-bingo/
│   └── bullshit-bingo.html      # Original bingo game
├── mindset-tracker/
│   ├── mindset-tracker.html     # NEW: This tracker app (to be built)
│   └── MINDSET-TRACKER-HANDOVER.md  # This document
└── AWS-INFRASTRUCTURE.md        # Shared AWS account docs
```

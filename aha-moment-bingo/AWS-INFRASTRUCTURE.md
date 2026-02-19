# AWS Infrastructure — CSI Bingo App

Complete documentation of all AWS resources deployed for the Aha Moment Bingo app.

---

## AWS Account & Access

| Detail | Value |
|--------|-------|
| **AWS Account ID** | 354918379520 |
| **Region** | us-east-1 |
| **CLI Profile** | `VolarisAI` |
| **SSO Login Command** | `aws sso login --profile VolarisAI` |
| **SSO Start URL** | https://volarisai.awsapps.com/start/ |
| **Authenticated User** | james.whiting@grosvenorsystems.com |
| **Access Level** | AdministratorAccess |
| **Cost Tag** | `Project=Volaris-bingo` |

### Authentication

```bash
# Login via SSO (opens browser for auth)
aws sso login --profile VolarisAI

# Verify identity
aws sts get-caller-identity --profile VolarisAI
```

---

## Resource Inventory

### 1. S3 Bucket — Static Hosting

| Detail | Value |
|--------|-------|
| **Bucket Name** | `csi-bingo-app` |
| **Region** | us-east-1 |
| **Access** | Private (CloudFront OAC only) |
| **Versioning** | Disabled |
| **Public Access** | All blocked |

**Files hosted:**
- `aha-moment-bingo.html` — Main bingo app
- `index.html` — (if deployed)

**Deploy/update command:**
```bash
aws s3 cp aha-moment-bingo.html s3://csi-bingo-app/aha-moment-bingo.html \
  --content-type "text/html" --profile VolarisAI
```

**Bucket policy** (allows CloudFront OAC access):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipal",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::csi-bingo-app/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::354918379520:distribution/EJEVF4NEXEJDI"
        }
      }
    }
  ]
}
```

---

### 2. CloudFront Distribution — CDN

| Detail | Value |
|--------|-------|
| **Distribution ID** | `EJEVF4NEXEJDI` |
| **Domain** | `d3c9oon0ixjih5.cloudfront.net` |
| **Origin** | `csi-bingo-app.s3.us-east-1.amazonaws.com` |
| **OAC ID** | `E22IY91C9GGAHK` |
| **Default Root Object** | `index.html` |
| **Protocol** | HTTPS (redirect HTTP) |
| **HTTP Version** | HTTP/2 |
| **Price Class** | PriceClass_100 (US, Canada, Europe) |
| **Certificate** | CloudFront default |
| **Cache Policy** | `658327ea-f89d-4fab-a63d-7e88639e58f6` (CachingOptimized) |
| **Compression** | Enabled |

**App URL:**
```
https://d3c9oon0ixjih5.cloudfront.net/aha-moment-bingo.html
```

**Cache invalidation after deploy:**
```bash
aws cloudfront create-invalidation \
  --distribution-id EJEVF4NEXEJDI \
  --paths "/aha-moment-bingo.html" \
  --profile VolarisAI
```

**Full invalidation:**
```bash
aws cloudfront create-invalidation \
  --distribution-id EJEVF4NEXEJDI \
  --paths "/*" \
  --profile VolarisAI
```

---

### 3a. DynamoDB Table — Journal Persistence

| Detail | Value |
|--------|-------|
| **Table Name** | `csi-bingo-journal` |
| **Billing Mode** | PAY_PER_REQUEST (on-demand) |
| **Partition Key** | `userId` (String) |
| **Sort Key** | `ahaText` (String) |
| **Region** | us-east-1 |

**Item schema:**
```json
{
  "userId": "james.whiting@example.com",
  "ahaText": "I gave an agent a codebase and a task...",
  "note": "User's journal reflection text",
  "track": "product",
  "timestamp": "2026-02-17T12:00:00.000Z"
}
```

**Query all entries for a user:**
```bash
aws dynamodb query \
  --table-name csi-bingo-journal \
  --key-condition-expression "userId = :uid" \
  --expression-attribute-values '{":uid":{"S":"test@example.com"}}' \
  --profile VolarisAI
```

---

### 3b. DynamoDB Table — Diagnostic / Pre-session Survey

> **Status: needs to be created before the accelerator app goes live.**

| Detail | Value |
|--------|-------|
| **Table Name** | `csi-bingo-diagnostics` |
| **Billing Mode** | PAY_PER_REQUEST (on-demand) |
| **Partition Key** | `userId` (String) — participant email |
| **Sort Key** | none |
| **Region** | us-east-1 |

**Item schema:**
```json
{
  "userId": "james.whiting@example.com",
  "name": "James Whiting",
  "vbu": "Grosvenor Systems",
  "role": "product",
  "level": "1",
  "q3": "Getting my team to actually try it, not just talk about it.",
  "q4": "One live agent working in my product by Friday.",
  "completedAt": "2026-03-03T09:00:00.000Z"
}
```

**Role values:** `product` | `rnd` | `leadership`
**Level values:** `"0"` | `"1"` | `"2"` | `"3"` (stored as strings)

**Create the table:**
```bash
aws dynamodb create-table \
  --table-name csi-bingo-diagnostics \
  --attribute-definitions AttributeName=userId,AttributeType=S \
  --key-schema AttributeName=userId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --profile VolarisAI
```

**Query a specific participant:**
```bash
aws dynamodb get-item \
  --table-name csi-bingo-diagnostics \
  --key '{"userId":{"S":"test@example.com"}}' \
  --profile VolarisAI
```

**Scan all responses (post-event analysis):**
```bash
aws dynamodb scan \
  --table-name csi-bingo-diagnostics \
  --profile VolarisAI
```

---

### 4. Lambda Function — API Backend

| Detail | Value |
|--------|-------|
| **Function Name** | `csi-bingo-journal` |
| **Runtime** | Node.js 20.x (nodejs20.x) |
| **Handler** | `index.handler` |
| **Architecture** | x86_64 |
| **Memory** | 128 MB |
| **Timeout** | 10 seconds |
| **IAM Role** | `csi-bingo-journal-lambda-role` |

> The Lambda now handles both `/journal` and `/diagnostic` routes in the same function.

**Function code** (`index.mjs`):
```javascript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });
const ddb = DynamoDBDocumentClient.from(client);
const TABLE = "csi-bingo-journal";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod;
  const path = event.rawPath || event.path || "";

  if (method === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    // GET /journal?userId=xxx
    if (method === "GET" && path.startsWith("/journal")) {
      const userId = event.queryStringParameters?.userId;
      if (!userId) return { statusCode: 400, headers, body: JSON.stringify({ error: "userId required" }) };
      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "userId = :uid",
        ExpressionAttributeValues: { ":uid": userId }
      }));
      return { statusCode: 200, headers, body: JSON.stringify({ entries: result.Items || [] }) };
    }

    // POST /journal - save entry
    if (method === "POST" && path.startsWith("/journal")) {
      const body = JSON.parse(event.body);
      const { userId, ahaText, note, track, timestamp } = body;
      if (!userId || !ahaText) return { statusCode: 400, headers, body: JSON.stringify({ error: "userId and ahaText required" }) };
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: { userId, ahaText, note: note || "", track: track || "general", timestamp: timestamp || new Date().toISOString() }
      }));
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // DELETE /journal?userId=xxx&ahaText=yyy
    if (method === "DELETE" && path.startsWith("/journal")) {
      const userId = event.queryStringParameters?.userId;
      const ahaText = event.queryStringParameters?.ahaText;
      if (!userId || !ahaText) return { statusCode: 400, headers, body: JSON.stringify({ error: "userId and ahaText required" }) };
      await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { userId, ahaText } }));
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: "Not found" }) };
  } catch (err) {
    console.error("Error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
```

**Update Lambda code:**
```bash
cd /tmp/bingo-lambda
zip -j function.zip index.mjs
aws lambda update-function-code \
  --function-name csi-bingo-journal \
  --zip-file fileb://function.zip \
  --profile VolarisAI
```

---

### 5. API Gateway — HTTP API

| Detail | Value |
|--------|-------|
| **API ID** | `qqkykyeiol` |
| **API Name** | `csi-bingo-journal-api` |
| **Protocol** | HTTP |
| **Base URL** | `https://qqkykyeiol.execute-api.us-east-1.amazonaws.com` |
| **Stage** | `$default` (auto-deploy) |
| **CORS** | Enabled (all origins) |

**Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/journal?userId=xxx` | Get all journal entries for a user |
| `POST` | `/journal` | Save a journal entry |
| `DELETE` | `/journal?userId=xxx&ahaText=yyy` | Delete a journal entry |
| `GET` | `/diagnostic?userId=xxx` | Look up an existing diagnostic record (200 or 404) |
| `POST` | `/diagnostic` | Save a new diagnostic record |
| `OPTIONS` | `*` | CORS preflight |

**Integration:** Lambda proxy integration with `csi-bingo-journal`

**Test endpoints:**
```bash
BASE=https://qqkykyeiol.execute-api.us-east-1.amazonaws.com

# --- Journal ---

# Get entries
curl "$BASE/journal?userId=test@example.com"

# Save entry
curl -X POST "$BASE/journal" \
  -H "Content-Type: application/json" \
  -d '{"userId":"test@example.com","ahaText":"Test aha","note":"Test note","track":"product"}'

# Delete entry
curl -X DELETE "$BASE/journal?userId=test%40example.com&ahaText=Test%20aha"

# --- Diagnostic ---

# Look up a participant (404 if new)
curl "$BASE/diagnostic?userId=test@example.com"

# Save a diagnostic record
curl -X POST "$BASE/diagnostic" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test@example.com",
    "name": "Test User",
    "vbu": "Grosvenor Systems",
    "role": "product",
    "level": "1",
    "q3": "Getting buy-in from my team",
    "q4": "One working agent by Friday",
    "completedAt": "2026-03-03T09:00:00.000Z"
  }'
```

---

### 6. IAM Role — Lambda Execution

| Detail | Value |
|--------|-------|
| **Role Name** | `csi-bingo-journal-lambda-role` |
| **Trust Policy** | Lambda service (`lambda.amazonaws.com`) |

**Attached policies:**

1. **DynamoDB access** (inline) — update this to include the diagnostics table:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:354918379520:table/csi-bingo-journal"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:354918379520:table/csi-bingo-diagnostics"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:us-east-1:354918379520:*"
    }
  ]
}
```

**Apply the updated policy via CLI:**
```bash
aws iam put-role-policy \
  --role-name csi-bingo-journal-lambda-role \
  --policy-name DynamoDBAccess \
  --policy-document file://iam-policy.json \
  --profile VolarisAI
```

---

## Architecture Diagram

```
User Browser
    │
    ├── Static HTML/CSS/JS ──→ CloudFront (EJEVF4NEXEJDI)
    │                              │
    │                              └──→ S3 (csi-bingo-app) via OAC
    │
    └── API calls ──→ API Gateway (qqkykyeiol)
                           │
                           └──→ Lambda (csi-bingo-journal)
                                    │
                                    ├──→ DynamoDB (csi-bingo-journal)     ← journal entries
                                    └──→ DynamoDB (csi-bingo-diagnostics) ← pre-session survey
```

---

## Cost Management

All resources are tagged with `Project=Volaris-bingo` for cost tracking.

**Expected costs (minimal usage):**
- **S3**: ~$0.01/month (single HTML file, minimal requests)
- **CloudFront**: ~$0.01-0.10/month (low traffic)
- **DynamoDB**: ~$0.00/month (on-demand, low volume)
- **Lambda**: ~$0.00/month (free tier covers this)
- **API Gateway**: ~$0.00/month (first 1M requests free)

**Check costs:**
```bash
# View tagged resources
aws resourcegroupstaggingapi get-resources \
  --tag-filters Key=Project,Values=Volaris-bingo \
  --profile VolarisAI
```

---

## Local Testing

The HTML file is fully self-contained — no build step, no local server needed.

### Open the app

```bash
open /Users/hom/Documents/Product/app/volaris-ai-bingo/aha-moment-bingo/aha-moment-bingo.html
```

### Test checklist

| Scenario | How to test |
|----------|-------------|
| Fresh visit wizard | DevTools → Application → Local Storage → delete all `aha-bingo-*` keys, refresh |
| Email step | Enter any email; if not in DynamoDB, advances to Step 1 (DynamoDB calls fail silently locally) |
| Step validation | Try clicking Next without filling in name/VBU/role — should block with alert |
| Landing page (pre-event) | In DevTools console: `EVENT_CONFIG.startDate = '2099-01-01'`, then complete wizard |
| Bingo card (event live) | In DevTools console: `EVENT_CONFIG.startDate = '2026-02-19'` (today's date) |
| Role → track mapping | Select "Leader" in wizard → bingo opens with Leadership track active |
| Returning user (same device) | Complete wizard once; refresh — wizard should be skipped entirely |
| Switch account | Click "(change)" next to name → clears localStorage, shows email step |
| Day tab locking | `EVENT_CONFIG.startDate = '2026-02-19'; EVENT_CONFIG.endDate = '2026-02-19'` → only Day 1 unlocked |

### Clear localStorage between tests (DevTools console)

```js
Object.keys(localStorage).filter(k => k.startsWith('aha-bingo')).forEach(k => localStorage.removeItem(k));
location.reload();
```

### Simulate different event states (DevTools console)

```js
// Before event — should show landing page after wizard
EVENT_CONFIG.startDate = '2099-01-01';

// Event live — should show bingo card
EVENT_CONFIG.startDate = '2026-02-19';
EVENT_CONFIG.endDate = '2026-02-22';

// Only Day 1 unlocked (tabs 2-4 greyed)
EVENT_CONFIG.startDate = '2026-02-19';
EVENT_CONFIG.endDate = '2026-02-22';
// (run on Day 1 of the range)
```

---

## Git Workflow

**Branch:** `app` (main working branch)
**Remote:** `https://github.com/jw-gsl/volaris-ai-bingo.git`

### Commit and push changes

```bash
cd /Users/hom/Documents/Product/app/volaris-ai-bingo

# Stage the changed files
git add aha-moment-bingo/aha-moment-bingo.html
git add aha-moment-bingo/lambda/index.mjs
git add aha-moment-bingo/AWS-INFRASTRUCTURE.md

# Commit
git commit -m "your message here"

# Push to remote
git push origin app
```

### Check what's changed before committing

```bash
git diff aha-moment-bingo/aha-moment-bingo.html
git status
```

---

## Deployment Workflow

### Full deploy (after code changes):

```bash
# 1. Login
aws sso login --profile VolarisAI

# 2. Upload HTML to S3
aws s3 cp aha-moment-bingo/aha-moment-bingo.html s3://csi-bingo-app/aha-moment-bingo.html \
  --content-type "text/html" --profile VolarisAI

# 3. Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id EJEVF4NEXEJDI \
  --paths "/aha-moment-bingo.html" \
  --profile VolarisAI
```

### Lambda update (after API changes):

```bash
# From the repo root
cp aha-moment-bingo/lambda/index.mjs /tmp/bingo-lambda/index.mjs
cd /tmp/bingo-lambda
zip -j function.zip index.mjs
aws lambda update-function-code \
  --function-name csi-bingo-journal \
  --zip-file fileb://function.zip \
  --profile VolarisAI
```

### Pre-event infrastructure checklist (run once before March 3)

```bash
# 1. Login
aws sso login --profile VolarisAI

# 2. Create the diagnostics DynamoDB table
aws dynamodb create-table \
  --table-name csi-bingo-diagnostics \
  --attribute-definitions AttributeName=userId,AttributeType=S \
  --key-schema AttributeName=userId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --profile VolarisAI

# 3. Update Lambda IAM policy to grant access to new table
#    (update the inline policy in the AWS Console or via CLI — see IAM section above)

# 4. Deploy updated Lambda code
cp aha-moment-bingo/lambda/index.mjs /tmp/bingo-lambda/index.mjs
cd /tmp/bingo-lambda && zip -j function.zip index.mjs
aws lambda update-function-code \
  --function-name csi-bingo-journal \
  --zip-file fileb://function.zip \
  --profile VolarisAI

# 5. Deploy updated HTML
cd /Users/hom/Documents/Product/app/volaris-ai-bingo
aws s3 cp aha-moment-bingo/aha-moment-bingo.html s3://csi-bingo-app/aha-moment-bingo.html \
  --content-type "text/html" --profile VolarisAI

# 6. Bust the cache
aws cloudfront create-invalidation \
  --distribution-id EJEVF4NEXEJDI \
  --paths "/aha-moment-bingo.html" \
  --profile VolarisAI

# 7. Smoke test
curl "https://qqkykyeiol.execute-api.us-east-1.amazonaws.com/diagnostic?userId=test@example.com"
# Expected: {"error":"Not found"} with HTTP 404
```

---

## Local Development & Testing

### Testing days before the event

The app locks days based on real clock time (Mountain Time). To test any day locally without touching the code, use the built-in dev shortcut:

| Action | Shortcut |
|--------|----------|
| Cycle to next day (D1→D2→D3→D4→D1) | **Shift+Option+D** (Mac) / **Shift+Alt+D** (Windows) |

The shortcut also dismisses the pre-event landing overlay automatically. No changes needed before going live — the combo is obscure enough that participants are unlikely to trigger it.

---

## Future: TTAD Tracker App

The TTAD (Toxic/Talker/Action/Driver) tracker app will use the same AWS account and infrastructure pattern. See `TTAD-TRACKER-HANDOVER.md` for full requirements. Additional resources needed:

- 4 new DynamoDB tables: `ttad-users`, `ttad-assessments`, `ttad-audit-log`, `ttad-notes`
- 1 new Lambda function: `ttad-tracker`
- 1 new API Gateway: `ttad-tracker-api`
- Same S3 bucket + CloudFront (path-based routing or new distribution)
- Same IAM role pattern with DynamoDB permissions for new tables

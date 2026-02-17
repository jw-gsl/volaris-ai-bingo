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

### 3. DynamoDB Table — Journal Persistence

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
| `OPTIONS` | `/journal` | CORS preflight |

**Integration:** Lambda proxy integration with `csi-bingo-journal`

**Test endpoints:**
```bash
# Get entries
curl "https://qqkykyeiol.execute-api.us-east-1.amazonaws.com/journal?userId=test@example.com"

# Save entry
curl -X POST "https://qqkykyeiol.execute-api.us-east-1.amazonaws.com/journal" \
  -H "Content-Type: application/json" \
  -d '{"userId":"test@example.com","ahaText":"Test aha","note":"Test note","track":"product"}'

# Delete entry
curl -X DELETE "https://qqkykyeiol.execute-api.us-east-1.amazonaws.com/journal?userId=test%40example.com&ahaText=Test%20aha"
```

---

### 6. IAM Role — Lambda Execution

| Detail | Value |
|--------|-------|
| **Role Name** | `csi-bingo-journal-lambda-role` |
| **Trust Policy** | Lambda service (`lambda.amazonaws.com`) |

**Attached policies:**

1. **DynamoDB access** (inline):
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
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:us-east-1:354918379520:*"
    }
  ]
}
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
    └── Journal API calls ──→ API Gateway (qqkykyeiol)
                                   │
                                   └──→ Lambda (csi-bingo-journal)
                                            │
                                            └──→ DynamoDB (csi-bingo-journal)
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

## Deployment Workflow

### Full deploy (after code changes):

```bash
# 1. Login
aws sso login --profile VolarisAI

# 2. Upload HTML to S3
aws s3 cp aha-moment-bingo.html s3://csi-bingo-app/aha-moment-bingo.html \
  --content-type "text/html" --profile VolarisAI

# 3. Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id EJEVF4NEXEJDI \
  --paths "/aha-moment-bingo.html" \
  --profile VolarisAI
```

### Lambda update (after API changes):

```bash
cd /tmp/bingo-lambda
zip -j function.zip index.mjs
aws lambda update-function-code \
  --function-name csi-bingo-journal \
  --zip-file fileb://function.zip \
  --profile VolarisAI
```

---

## Future: TTAD Tracker App

The TTAD (Toxic/Talker/Action/Driver) tracker app will use the same AWS account and infrastructure pattern. See `TTAD-TRACKER-HANDOVER.md` for full requirements. Additional resources needed:

- 4 new DynamoDB tables: `ttad-users`, `ttad-assessments`, `ttad-audit-log`, `ttad-notes`
- 1 new Lambda function: `ttad-tracker`
- 1 new API Gateway: `ttad-tracker-api`
- Same S3 bucket + CloudFront (path-based routing or new distribution)
- Same IAM role pattern with DynamoDB permissions for new tables

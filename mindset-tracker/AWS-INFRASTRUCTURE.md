# AWS Infrastructure — Mindset Tracker App

Complete documentation of all AWS resources deployed for the Mindset Tracker app.

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
| **Bucket Name** | `mindset-tracker-app` |
| **Region** | us-east-1 |
| **Access** | Private (CloudFront OAC only) |
| **Public Access** | All blocked |

**Files hosted:**
- `mindset-tracker.html` — Main mindset tracker app

**Deploy/update command:**
```bash
aws s3 cp mindset-tracker.html s3://mindset-tracker-app/mindset-tracker.html \
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
      "Resource": "arn:aws:s3:::mindset-tracker-app/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::354918379520:distribution/E3TXPHY6AGBVX4"
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
| **Distribution ID** | `E3TXPHY6AGBVX4` |
| **Domain** | `d2cv9wz6htxv9u.cloudfront.net` |
| **Origin** | `mindset-tracker-app.s3.us-east-1.amazonaws.com` |
| **OAC ID** | `E3KSZGNNK4X0KP` |
| **Default Root Object** | `mindset-tracker.html` |
| **Protocol** | HTTPS (redirect HTTP) |
| **HTTP Version** | HTTP/2 |
| **Price Class** | PriceClass_100 (US, Canada, Europe) |
| **Certificate** | CloudFront default |
| **Cache Policy** | `658327ea-f89d-4fab-a63d-7e88639e58f6` (CachingOptimized) |
| **Compression** | Enabled |

**App URL:**
```
https://d2cv9wz6htxv9u.cloudfront.net/mindset-tracker.html
```

**Cache invalidation after deploy:**
```bash
aws cloudfront create-invalidation \
  --distribution-id E3TXPHY6AGBVX4 \
  --paths "/mindset-tracker.html" \
  --profile VolarisAI
```

**Full invalidation:**
```bash
aws cloudfront create-invalidation \
  --distribution-id E3TXPHY6AGBVX4 \
  --paths "/*" \
  --profile VolarisAI
```

---

### 3. DynamoDB Tables (4)

All tables use PAY_PER_REQUEST (on-demand) billing.

#### mindset-users
| Detail | Value |
|--------|-------|
| **Table Name** | `mindset-users` |
| **Partition Key** | `userId` (String) — email address |
| **Attributes** | name, email, vbu, track, createdAt |

#### mindset-assessments
| Detail | Value |
|--------|-------|
| **Table Name** | `mindset-assessments` |
| **Partition Key** | `participantId` (String) — email |
| **Sort Key** | `dayAssessor` (String) — e.g. `D1#james@example.com` |
| **Attributes** | day, assessorId, assessorName, level, timestamp |

#### mindset-audit-log
| Detail | Value |
|--------|-------|
| **Table Name** | `mindset-audit-log` |
| **Partition Key** | `participantId` (String) |
| **Sort Key** | `timestamp` (String) — ISO 8601 |
| **Attributes** | action, assessorId, assessorName, day, previousLevel, newLevel |

#### mindset-notes
| Detail | Value |
|--------|-------|
| **Table Name** | `mindset-notes` |
| **Partition Key** | `participantId` (String) |
| **Sort Key** | `timestamp` (String) — ISO 8601 |
| **Attributes** | authorId, authorName, note |

**Query examples:**
```bash
# List all participants
aws dynamodb scan --table-name mindset-users --profile VolarisAI

# Get assessments for a participant on a specific day
aws dynamodb query \
  --table-name mindset-assessments \
  --key-condition-expression "participantId = :pid AND begins_with(dayAssessor, :day)" \
  --expression-attribute-values '{":pid":{"S":"alice@acme.com"},":day":{"S":"D1#"}}' \
  --profile VolarisAI
```

---

### 4. Cognito User Pool — Authentication

| Detail | Value |
|--------|-------|
| **User Pool ID** | `us-east-1_AatsAsuay` |
| **User Pool Name** | `mindset-tracker` |
| **Hosted UI Domain** | `mindset-tracker-csi.auth.us-east-1.amazoncognito.com` |
| **App Client ID** | `6hudm6vbdj4oc5n8ol6237al34` |
| **App Client Name** | `mindset-tracker-web` |
| **OAuth Flows** | Implicit (id_token) |
| **Scopes** | openid, email, profile |
| **Callback URL** | `https://d2cv9wz6htxv9u.cloudfront.net/mindset-tracker.html` |
| **Logout URL** | `https://d2cv9wz6htxv9u.cloudfront.net/mindset-tracker.html` |
| **UI Customization** | Custom CSS + Volaris logo (navy/teal theme) |

**Login URL:**
```
https://mindset-tracker-csi.auth.us-east-1.amazoncognito.com/login?response_type=token&client_id=6hudm6vbdj4oc5n8ol6237al34&redirect_uri=https://d2cv9wz6htxv9u.cloudfront.net/mindset-tracker.html&scope=openid+email+profile
```

**User management:**
```bash
# List users
aws cognito-idp list-users --user-pool-id us-east-1_AatsAsuay \
  --region us-east-1 --profile VolarisAI

# Create a new facilitator
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_AatsAsuay \
  --username "user@example.com" \
  --user-attributes Name=email,Value=user@example.com Name=email_verified,Value=true Name=name,Value="User Name" \
  --temporary-password "Temp1234!" \
  --region us-east-1 --profile VolarisAI

# Delete a user
aws cognito-idp admin-delete-user \
  --user-pool-id us-east-1_AatsAsuay \
  --username "user@example.com" \
  --region us-east-1 --profile VolarisAI
```

**Existing facilitator accounts:**

| Name | Email | Created |
|------|-------|---------|
| James Whiting | james.whiting@grosvenorsystems.com | 2026-02-17 |

---

### 5. Lambda Function — API Backend

| Detail | Value |
|--------|-------|
| **Function Name** | `mindset-tracker` |
| **Runtime** | Node.js 20.x (nodejs20.x) |
| **Handler** | `index.handler` |
| **Architecture** | x86_64 |
| **Memory** | 128 MB |
| **Timeout** | 10 seconds |
| **IAM Role** | `mindset-tracker-lambda-role` |
| **Source Code** | `mindset-tracker/lambda/index.mjs` |

**Update Lambda code:**
```bash
cd /tmp/mindset-lambda
cp /path/to/mindset-tracker/lambda/index.mjs .
zip -j function.zip index.mjs
aws lambda update-function-code \
  --function-name mindset-tracker \
  --zip-file fileb://function.zip \
  --profile VolarisAI
```

---

### 6. API Gateway — HTTP API

| Detail | Value |
|--------|-------|
| **API ID** | `vxm4x8vt1b` |
| **API Name** | `mindset-tracker-api` |
| **Protocol** | HTTP |
| **Base URL** | `https://vxm4x8vt1b.execute-api.us-east-1.amazonaws.com` |
| **Stage** | `$default` (auto-deploy) |
| **CORS** | Enabled (all origins) |
| **Authorizer** | JWT (Cognito), ID: `6e1pbq` |
| **Integration** | Lambda proxy (mindset-tracker), ID: `p91fkv7` |

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/participants` | List all participants |
| `POST` | `/participants` | Add a participant |
| `DELETE` | `/participants/{email}` | Remove a participant |
| `POST` | `/participants/import` | Bulk import from CSV |
| `GET` | `/assessments?participantId=X&day=D1` | Get assessments |
| `POST` | `/assessments` | Save assessment + audit log |
| `GET` | `/consensus?day=D1` | Dashboard consensus data |
| `GET` | `/audit-log?participantId=X` | Audit log entries |
| `GET` | `/notes/{participantId}` | Get notes |
| `POST` | `/notes` | Add a note |

All endpoints require a valid Cognito JWT in the `Authorization: Bearer <token>` header.

**Test endpoints:**
```bash
# Get a token first via Cognito login, then:
TOKEN="your-id-token-here"

curl -H "Authorization: Bearer $TOKEN" \
  "https://vxm4x8vt1b.execute-api.us-east-1.amazonaws.com/participants"

curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "https://vxm4x8vt1b.execute-api.us-east-1.amazonaws.com/assessments" \
  -d '{"participantId":"alice@acme.com","day":"D1","level":"action"}'
```

---

### 7. IAM Role — Lambda Execution

| Detail | Value |
|--------|-------|
| **Role Name** | `mindset-tracker-lambda-role` |
| **Trust Policy** | Lambda service (`lambda.amazonaws.com`) |

**Inline policy (`mindset-tracker-dynamodb`):**
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
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:BatchWriteItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:354918379520:table/mindset-users",
        "arn:aws:dynamodb:us-east-1:354918379520:table/mindset-assessments",
        "arn:aws:dynamodb:us-east-1:354918379520:table/mindset-audit-log",
        "arn:aws:dynamodb:us-east-1:354918379520:table/mindset-notes"
      ]
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
    ├── Static HTML/CSS/JS ──→ CloudFront (E3TXPHY6AGBVX4)
    │                              │
    │                              └──→ S3 (mindset-tracker-app) via OAC
    │
    └── API calls (JWT auth) ──→ API Gateway (vxm4x8vt1b)
                                       │
                                       ├── Cognito JWT Authorizer
                                       │
                                       └──→ Lambda (mindset-tracker)
                                                │
                                                ├──→ DynamoDB (mindset-users)
                                                ├──→ DynamoDB (mindset-assessments)
                                                ├──→ DynamoDB (mindset-audit-log)
                                                └──→ DynamoDB (mindset-notes)
```

---

## Cost Management

All resources tagged with `Project=Volaris-bingo` for cost tracking.

**Expected costs (minimal usage):**
- **S3**: ~$0.01/month
- **CloudFront**: ~$0.01-0.10/month
- **DynamoDB (x4)**: ~$0.00/month (on-demand, low volume)
- **Lambda**: ~$0.00/month (free tier)
- **API Gateway**: ~$0.00/month (first 1M requests free)
- **Cognito**: ~$0.00/month (first 50k MAU free)

**Check tagged resources:**
```bash
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
aws s3 cp mindset-tracker.html s3://mindset-tracker-app/mindset-tracker.html \
  --content-type "text/html" --profile VolarisAI

# 3. Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id E3TXPHY6AGBVX4 \
  --paths "/mindset-tracker.html" \
  --profile VolarisAI
```

### Lambda update (after API changes):

```bash
cd /tmp/mindset-lambda
cp /path/to/mindset-tracker/lambda/index.mjs .
zip -j function.zip index.mjs
aws lambda update-function-code \
  --function-name mindset-tracker \
  --zip-file fileb://function.zip \
  --profile VolarisAI
```

---

## File Structure

```
mindset-tracker/
├── mindset-tracker.html           # Frontend app (deployed to S3)
├── lambda/
│   └── index.mjs                  # Lambda function code
├── MINDSET-TRACKER-HANDOVER.md    # Requirements & design document
└── AWS-INFRASTRUCTURE.md          # This file — AWS deployment docs
```

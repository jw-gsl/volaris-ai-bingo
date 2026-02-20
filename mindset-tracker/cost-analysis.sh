#!/usr/bin/env bash
# =============================================================================
# Mindset Tracker — AWS Cost Analysis
# =============================================================================
#
# All resources are tagged: Project = Volaris-bingo
# The "Project" tag has been activated as a Cost Allocation Tag in AWS.
#
# Prerequisites:
#   - AWS CLI v2 installed
#   - AWS_PROFILE=VolarisAI configured (or set your own profile below)
#   - Cost Explorer API access enabled on the account
#
# Usage:
#   ./cost-analysis.sh                   # Current month
#   ./cost-analysis.sh 2026-02           # Specific month
#   ./cost-analysis.sh 2026-01 2026-03   # Date range
#
# =============================================================================

set -euo pipefail

PROFILE="${AWS_PROFILE:-VolarisAI}"
REGION="us-east-1"
PROJECT_TAG="Volaris-bingo"

# Date range: default to current month
if [ $# -ge 2 ]; then
    START="${1}-01"
    # Calculate end of the second month
    END=$(date -j -f "%Y-%m-%d" "${2}-01" "+%Y-%m-%d" 2>/dev/null || date -d "${2}-01 +1 month" "+%Y-%m-%d")
    END=$(date -j -v+1m -f "%Y-%m-%d" "${2}-01" "+%Y-%m-%d" 2>/dev/null || date -d "${2}-01 +1 month" "+%Y-%m-%d")
elif [ $# -eq 1 ]; then
    START="${1}-01"
    END=$(date -j -v+1m -f "%Y-%m-%d" "${1}-01" "+%Y-%m-%d" 2>/dev/null || date -d "${1}-01 +1 month" "+%Y-%m-%d")
else
    START=$(date "+%Y-%m-01")
    END=$(date -j -v+1m -f "%Y-%m-%d" "$START" "+%Y-%m-%d" 2>/dev/null || date -d "$START +1 month" "+%Y-%m-%d")
fi

echo "=========================================="
echo " Mindset Tracker — AWS Cost Report"
echo " Project Tag: ${PROJECT_TAG}"
echo " Period: ${START} to ${END}"
echo "=========================================="
echo ""

# ----- 1. Project-specific costs (by tag) -----
echo "--- Project-Tagged Costs (by Service) ---"
echo ""

aws ce get-cost-and-usage \
    --profile "$PROFILE" \
    --region "$REGION" \
    --time-period "Start=${START},End=${END}" \
    --granularity MONTHLY \
    --metrics "UnblendedCost" \
    --filter "{\"Tags\":{\"Key\":\"Project\",\"Values\":[\"${PROJECT_TAG}\"]}}" \
    --group-by Type=DIMENSION,Key=SERVICE \
    --output json 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
total = 0
rows = []
for period in data.get('ResultsByTime', []):
    for g in period.get('Groups', []):
        svc = g['Keys'][0]
        cost = float(g['Metrics']['UnblendedCost']['Amount'])
        if cost > 0.001:
            rows.append((svc, cost))
            total += cost
    # If no groups, check total
    if not period.get('Groups'):
        t = float(period.get('Total', {}).get('UnblendedCost', {}).get('Amount', 0))
        if t > 0:
            total = t

if rows:
    rows.sort(key=lambda x: -x[1])
    for svc, cost in rows:
        print(f'  {svc:<45} \${cost:>10.4f}')
    print(f'  {\"\":-<45} {\"\":-<11}')
    print(f'  {\"TOTAL\":<45} \${total:>10.4f}')
else:
    print('  No tagged costs found for this period.')
    print('  (Tag cost allocation can take 24h to activate)')
    print(f'  Total from tag filter: \${total:.4f}')
print()
"

# ----- 2. Per-resource breakdown (known services) -----
echo "--- Known Mindset Tracker Resources ---"
echo ""
echo "  Lambda:       mindset-tracker"
echo "  API Gateway:  vxm4x8vt1b (mindset-tracker-api)"
echo "  DynamoDB:     mindset-users, mindset-assessments,"
echo "                mindset-audit-log, mindset-notes, mindset-vbus"
echo "  S3:           mindset-tracker-app"
echo "  CloudFront:   E3TXPHY6AGBVX4"
echo "  Cognito:      us-east-1_AatsAsuay"
echo ""

# ----- 3. Account-wide costs for relevant services -----
echo "--- Account-Wide Costs (Relevant Services) ---"
echo ""

SERVICES=(
    "AWS Lambda"
    "Amazon API Gateway"
    "Amazon DynamoDB"
    "Amazon Simple Storage Service"
    "Amazon CloudFront"
    "Amazon Cognito"
)

aws ce get-cost-and-usage \
    --profile "$PROFILE" \
    --region "$REGION" \
    --time-period "Start=${START},End=${END}" \
    --granularity MONTHLY \
    --metrics "UnblendedCost" \
    --group-by Type=DIMENSION,Key=SERVICE \
    --output json 2>/dev/null | python3 -c "
import json, sys
services = set($(python3 -c "import json; print(json.dumps([$(printf '"%s",' "${SERVICES[@]}")]))" ))
data = json.load(sys.stdin)
total = 0
for period in data.get('ResultsByTime', []):
    for g in period.get('Groups', []):
        svc = g['Keys'][0]
        cost = float(g['Metrics']['UnblendedCost']['Amount'])
        if any(s.lower() in svc.lower() for s in services):
            print(f'  {svc:<45} \${cost:>10.4f}')
            total += cost
print(f'  {\"\":-<45} {\"\":-<11}')
print(f'  {\"TOTAL (these services)\":<45} \${total:>10.4f}')
print()
print('  Note: These are account-wide costs, not project-specific.')
print('  For project-specific costs, use the tagged costs above.')
"

echo ""
echo "--- Tag Verification ---"
echo ""

# Check all resources are tagged
echo "  Checking Project tag on resources..."
for TABLE in mindset-users mindset-assessments mindset-audit-log mindset-notes mindset-vbus; do
    ARN=$(aws dynamodb describe-table --table-name "$TABLE" --profile "$PROFILE" --region "$REGION" --query 'Table.TableArn' --output text 2>/dev/null)
    TAG=$(aws dynamodb list-tags-of-resource --resource-arn "$ARN" --profile "$PROFILE" --region "$REGION" --query "Tags[?Key=='Project'].Value" --output text 2>/dev/null)
    STATUS=$([[ "$TAG" == "$PROJECT_TAG" ]] && echo "OK" || echo "MISSING")
    printf "  %-30s %s\n" "DynamoDB/$TABLE" "$STATUS"
done

TAG=$(aws lambda get-function --function-name mindset-tracker --profile "$PROFILE" --region "$REGION" --query 'Tags.Project' --output text 2>/dev/null)
printf "  %-30s %s\n" "Lambda/mindset-tracker" "$([[ "$TAG" == "$PROJECT_TAG" ]] && echo "OK" || echo "MISSING")"

TAG=$(aws s3api get-bucket-tagging --bucket mindset-tracker-app --profile "$PROFILE" --region "$REGION" --query "TagSet[?Key=='Project'].Value" --output text 2>/dev/null)
printf "  %-30s %s\n" "S3/mindset-tracker-app" "$([[ "$TAG" == "$PROJECT_TAG" ]] && echo "OK" || echo "MISSING")"

TAG=$(aws cloudfront list-tags-for-resource --resource arn:aws:cloudfront::354918379520:distribution/E3TXPHY6AGBVX4 --profile "$PROFILE" --query "Tags.Items[?Key=='Project'].Value" --output text 2>/dev/null)
printf "  %-30s %s\n" "CloudFront/E3TXPHY6AGBVX4" "$([[ "$TAG" == "$PROJECT_TAG" ]] && echo "OK" || echo "MISSING")"

TAG=$(aws apigatewayv2 get-api --api-id vxm4x8vt1b --profile "$PROFILE" --region "$REGION" --query 'Tags.Project' --output text 2>/dev/null)
printf "  %-30s %s\n" "APIGateway/vxm4x8vt1b" "$([[ "$TAG" == "$PROJECT_TAG" ]] && echo "OK" || echo "MISSING")"

TAG=$(aws cognito-idp describe-user-pool --user-pool-id us-east-1_AatsAsuay --profile "$PROFILE" --region "$REGION" --query "UserPool.Tags.Project" --output text 2>/dev/null)
printf "  %-30s %s\n" "Cognito/us-east-1_AatsAsuay" "$([[ "$TAG" == "$PROJECT_TAG" ]] && echo "OK" || echo "MISSING")"

echo ""
echo "=========================================="
echo " Done."
echo "=========================================="

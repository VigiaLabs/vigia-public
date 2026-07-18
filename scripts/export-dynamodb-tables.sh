#!/usr/bin/env bash
# Export every DynamoDB table in the account to JSON before teardown.
# These tables hold real runtime data (rewards ledgers, enterprise users, device
# registries, attestation logs) that is NOT reproducible from source — unlike the
# pgvector store, which regenerates from the repo. Run this before any final AWS
# teardown or account closure, and again right before you migrate to Azure.
#
# Usage:  ./scripts/export-dynamodb-tables.sh [region] [output-dir]
# Default: us-east-1, ./aws-backup/dynamodb
set -euo pipefail

REGION="${1:-us-east-1}"
OUT="${2:-./aws-backup/dynamodb}"
mkdir -p "$OUT"

echo "Exporting DynamoDB tables from $REGION → $OUT"
TABLES=$(aws dynamodb list-tables --region "$REGION" --query "TableNames[]" --output text)

for t in $TABLES; do
  echo "  • $t"
  # Paginated full-table scan → newline-delimited JSON of raw items.
  next=""
  : > "$OUT/$t.json"
  while : ; do
    if [ -z "$next" ]; then
      page=$(aws dynamodb scan --table-name "$t" --region "$REGION" --output json)
    else
      page=$(aws dynamodb scan --table-name "$t" --region "$REGION" \
        --exclusive-start-key "$next" --output json)
    fi
    echo "$page" | python3 -c "import sys,json; d=json.load(sys.stdin); [print(json.dumps(i)) for i in d.get('Items',[])]" >> "$OUT/$t.json"
    next=$(echo "$page" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['LastEvaluatedKey']) if 'LastEvaluatedKey' in d else '')")
    [ -z "$next" ] && break
  done
  count=$(wc -l < "$OUT/$t.json" | tr -d ' ')
  echo "    → $count items"
done

echo "Done. Backups in $OUT (git-ignored)."

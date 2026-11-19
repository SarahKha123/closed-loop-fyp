#!/usr/bin/env bash
# One-time: the S3 bucket that holds Terraform's state (versioned, private, encrypted). Needs AWS admin
# credentials on this machine (aws sts get-caller-identity). Safe to re-run.
set -euo pipefail
region=ap-southeast-1
account=$(aws sts get-caller-identity --query Account --output text)
bucket="closed-loop-tfstate-$account"

if ! aws s3api head-bucket --bucket "$bucket" 2>/dev/null; then
  aws s3api create-bucket --bucket "$bucket" --region "$region" \
    --create-bucket-configuration LocationConstraint="$region" >/dev/null
fi
aws s3api put-bucket-versioning --bucket "$bucket" --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket "$bucket" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

echo "State bucket ready. From infra/:  terraform init -backend-config=\"bucket=$bucket\""

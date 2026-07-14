# VIGIA V2 Rollback Assets

Verified on 2026-07-15 before the V2 release:

- Web rollback Git commit: `21ad2cf2bce0abb9405abcae3c3e429ab7282dd7`.
- Android rollback Git commit: `4164ec4ba43723f491dad7fae7835f3705158e42`.
- VIGIASearch ECR repository: `203800220566.dkr.ecr.us-east-1.amazonaws.com/vigia-search-engine`.
- Immutable rollback image tag: `rollback-pre-v2-20260715`.
- Rollback image digest: `sha256:41c5a76d838fccacac43a4a5ac3b5e02d967dbb70ab5b5563c5fcfa36f546e14`.
- Tested Android demo APK SHA-256: `081d2fda0906bbd0c3c6ceabf541e4f75e45caee797a3e684df0a9ea1790737d`.

The Android APK is built with:

```sh
./gradlew :core:network:test :feature:copilot:test :app:assembleDemoDebug
```

Before rollback, verify the selected Git revision or ECR image digest exactly matches this file. Never use an unpinned `latest` image as a rollback target.

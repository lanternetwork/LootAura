# Test Sale Data Feature Flag

## Overview
Add a feature flag to control test sale data generation and visibility.

## Implementation Plan
- Add environment variable flag (e.g., `ENABLE_TEST_SALE_DATA`)
- Update API routes to check flag before returning test data
- Add flag check in test data generation scripts
- Document flag in env.example and production docs


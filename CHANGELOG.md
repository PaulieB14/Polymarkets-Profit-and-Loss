# Changelog

## Version 1.0.1 - Transaction Gap Fix (December 12, 2025)

### Critical Fixes

#### 1. Fixed Transaction Entity Creation Failure (Blocks 67.3M - 78.9M Gap)
**Root Cause**: The `event.receipt` property was being accessed in the `handleOrderFilled` function, which can be null or unavailable depending on the Graph Node version and network conditions. This caused silent failures in Transaction entity creation.

**Fix**: Removed all `event.receipt` access and set `gasUsed` to `ZERO_BI` for Transaction entities.
- **Lines Fixed**: 426, 444 in `src/mapping.ts`
- **Impact**: Ensures Transaction entities are always created, even when receipt data is unavailable

#### 2. Fixed Account Creation Timestamp
**Root Cause**: Account entities were being initialized with `creationTimestamp = ZERO_BI` instead of the actual block timestamp.

**Fix**: Updated `getOrCreateAccount()` to accept a timestamp parameter and properly set `creationTimestamp` and `lastSeenTimestamp` on first creation.
- **Lines Fixed**: 79-97 in `src/mapping.ts`
- **Impact**: Accurate account creation timestamps for all users

#### 3. Fixed Entity ID Collisions
**Root Cause**: Split, Merge, and Redemption entities used only `transaction.hash` as ID, which could cause collisions when multiple events occur in the same transaction.

**Fix**: Added `logIndex` to entity IDs to ensure uniqueness.
- **Entities Fixed**: Split, Merge, Redemption
- **Lines Fixed**: 276, 294, 312 in `src/mapping.ts`
- **Impact**: Prevents data loss from ID collisions

### Technical Details

**Files Modified**:
- `src/mapping.ts` - Main mapping logic
- `package.json` - Updated deploy script to correct subgraph name

**Event Handlers Updated**:
- `handleOrderFilled` - Critical fix for Transaction creation
- `handlePositionSplit` - ID collision fix + timestamp fix
- `handlePositionsMerge` - ID collision fix + timestamp fix
- `handlePayoutRedemption` - ID collision fix + timestamp fix
- `handleTransferSingle` - Timestamp fix
- `handleTransferBatch` - Timestamp fix
- `handleFeeCharged` - Timestamp fix

### Deployment Instructions

1. **Build the fixed subgraph**:
   ```bash
   graph codegen && graph build
   ```

2. **Authenticate with Graph Studio**:
   ```bash
   graph auth --studio <YOUR_DEPLOY_KEY>
   ```

3. **Deploy the new version**:
   ```bash
   npm run deploy
   ```
   Or manually:
   ```bash
   graph deploy --studio polymarket-profit-and-loss-revised
   ```

4. **Rewind to re-index missing data**:
   After deployment, rewind the subgraph to block `67000000` in Graph Studio to re-index the missing Transaction data.

### Expected Results

After redeploying and rewinding:
- Transaction entities will be created for ALL OrderFilled events from block 67.3M onwards
- Account creation timestamps will be accurate
- No entity ID collisions
- Complete data coverage from startBlock (40M) to current block

### Data Gap Summary

**Previous State**:
- Transactions indexed: 40M - 67.3M ✅
- **Data Gap**: 67.3M - 78.9M ❌
- Transactions indexed: 78.9M - current ✅

**After Fix**:
- Transactions indexed: 40M - current ✅ (after rewind)

### Notes

- OrderFilledEvent entities were created correctly throughout (including the gap period)
- Split, Merge, and Redemption entities were NOT affected by the gap
- The issue was specific to Transaction entity creation due to `event.receipt` access


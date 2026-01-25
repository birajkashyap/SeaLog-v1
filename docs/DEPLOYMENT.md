# SeaLog Deployment Guide

## Deployment Record

This document tracks all production deployments of SeaLog smart contracts.

---

## Sepolia Testnet Deployment

**Status**: ⏸️ Pending deployment

**Git Commit**: `v1.0.0-crypto-locked`

**Deployment Date**: TBD

**Contract Details**:
- Contract Address: `<TO_BE_FILLED>`
- Deployment Tx Hash: `<TO_BE_FILLED>`
- Deployer Address: `<TO_BE_FILLED>`
- Block Number: `<TO_BE_FILLED>`
- Gas Used: `<TO_BE_FILLED>`

**Compiler Details**:
- Solidity Version: `0.8.20`
- Hardhat Version: `2.28.3`
- Optimizer: Enabled (200 runs)

**Verification**:
- Etherscan Verification: ⏸️ Pending
- Verification Tx: `<TO_BE_FILLED>`

**First Batch Anchored**:
- Batch ID: `<TO_BE_FILLED>`
- Merkle Root: `<TO_BE_FILLED>`
- Anchor Tx Hash: `<TO_BE_FILLED>`
- Block Number: `<TO_BE_FILLED>`
- Block Timestamp: `<TO_BE_FILLED>`
- Number of Logs: `<TO_BE_FILLED>`

---

## Deployment Checklist

### Pre-Deployment

- [x] Code review complete
- [x] All tests passing
- [x] Cryptographic semantics documented and locked
- [x] Git tag created: `v1.0.0-crypto-locked`
- [ ] Sepolia ETH in deployer wallet
- [ ] `.env` configured with Sepolia RPC URL
- [ ] `.env` configured with private key

### Deployment

- [ ] Deploy contract to Sepolia
- [ ] Record contract address
- [ ] Update `.env` with `CONTRACT_ADDRESS`
- [ ] Verify contract on Etherscan
- [ ] Update this document with deployment details

### Post-Deployment Verification

- [ ] Ingest test logs
- [ ] Create batch
- [ ] Anchor batch to Sepolia
- [ ] Verify on-chain root matches local computation
- [ ] Export audit bundle
- [ ] Perform offline verification
- [ ] Query blockchain directly (no SeaLog API)

---

## Deployment Commands

### 1. Deploy Contract

```bash
npx hardhat run contracts/scripts/deploy.js --network sepolia
```

### 2. Verify on Etherscan

```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

### 3. Check Deployment

```bash
# View on Etherscan
open https://sepolia.etherscan.io/address/<CONTRACT_ADDRESS>

# Query contract directly
cast call <CONTRACT_ADDRESS> "isAnchored(bytes32)" <MERKLE_ROOT> --rpc-url $BLOCKCHAIN_RPC_URL
```

---

## Mainnet Deployment

**Status**: ⏸️ Not yet deployed

Mainnet deployment will only proceed after:
1. ✅ Successful Sepolia deployment
2. ✅ End-to-end testing complete
3. ✅ Security audit (if required)
4. ✅ Load testing complete
5. ✅ Production readiness review

---

## Rollback Plan

If a critical bug is discovered post-deployment:

1. **DO NOT** attempt to "fix" the smart contract (immutable)
2. Deploy a new contract with fixes
3. Update `.env` with new `CONTRACT_ADDRESS`
4. Document the issue in this file
5. Mark old contract as deprecated in docs

**CRITICAL**: Old batches anchored to the old contract remain valid. Merkle proofs for those batches must verify against the old contract address.

---

## Audit Trail

| Date | Action | Details | Git Commit |
|------|--------|---------|------------|
| 2024-01-25 | Crypto semantics locked | Odd-node handling documented | `v1.0.0-crypto-locked` |
| TBD | Sepolia deployment | First deployment | TBD |


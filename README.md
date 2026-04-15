# SeaLog - Tamper-Evident Log Integrity System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

SeaLog is a cryptographic integrity layer over logs that provides tamper-evident logging using Merkle trees and Ethereum blockchain anchoring.

## ⚠️ Merkle Tree Semantics (Cryptographically Locked)

SeaLog uses a **position-preserving binary Merkle tree** with **Bitcoin-style odd-node duplication** (`H(x || x)`).

This behavior is **cryptographically locked** for all anchored batches and will **never change retroactively**.

Any modification to the Merkle tree semantics would invalidate all previously anchored batches.

## Features

- **Append-Only Logs**: Cryptographically enforced immutability
- **Merkle Tree Commitments**: Efficient batching with O(log N) proof size
- **Cross-Batch Consistency**: Cryptographic hash chaining between batches to detect deletion
- **Blockchain Anchoring**: Immutable timestamping via Ethereum
- **Zero-Trust Verification**: Independent auditors can verify without trusting SeaLog
- **Tamper Detection**: Any log alteration, deletion, or batch deletion is cryptographically detectable

## Architecture

SeaLog is not a log storage replacement—it's a **proof system**. It works alongside your existing logging infrastructure (ELK, CloudWatch, etc.) to add cryptographic guarantees.

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Docker (optional, for local development)

### Installation

```bash
# Clone repository
git clone <repository-url>
cd SeaLog

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Start PostgreSQL (using Docker)
docker-compose up -d postgres

# Run database migrations
npm run db:migrate

# Generate Prisma client
npm run db:generate

# Start development server
npm run dev
```

### Database Setup

SeaLog uses PostgreSQL with strict append-only constraints:

```bash
# Start database
docker-compose up -d postgres

# Run migrations (includes trigger setup)
npm run db:migrate

# IMPORTANT: Revoke dangerous permissions (run as superuser)
psql -U postgres -d sealog -c "REVOKE UPDATE, DELETE, TRUNCATE ON logs FROM sealog_user;"
```

## System Invariants

SeaLog is built on 10 immutable design principles. See [docs/INVARIANTS.md](docs/INVARIANTS.md) for detailed documentation.

**Critical Invariants:**
1. Logs are append-only (no mutation ever)
2. Global sequence defines total order
3. Dual timestamps in leaf hash (prevent backdating)
4. Merkle internal hash preserves position (no sorting)
5. Proofs are derivable, never trusted from DB cache
6. Batches are cryptographically chained to prevent gap deletions

## API Endpoints

SeaLog provides a REST API for log ingestion and verification:

### Ingest Logs

```bash
POST /api/v1/logs/ingest
Content-Type: application/json

{
  "source_service": "auth-service",
  "log_level": "INFO",
  "message": "User logged in",
  "metadata": { "user_id": "12345" }
}
```

**Response:**
```json
{
  "log_id": "550e8400-e29b-41d4-a716-446655440001",
  "sequence_number": 1001,
  "acknowledged_at": "2024-01-15T10:30:01.500Z",
  "batch_status": "pending"
}
```

### Verify Log

```bash
GET /api/v1/verify/log/:log_id
```

**Returns:** Complete cryptographic proof including:
- Merkle proof (siblings + path)
- Batch information
- Blockchain anchor details
- Verification instructions

### Generate Audit Bundle

```bash
GET /api/v1/audit/:log_id
```

**Returns:** Standalone audit package for offline verification.

### Other Endpoints

- `GET /api/v1/verify/batch/:batch_id` - Verify entire batch
- `GET /api/v1/verify/chain` - Verify cross-batch cryptographic chain and detect gaps
- `POST /api/v1/admin/batch/trigger` - Manually trigger batch creation
- `GET /api/v1/batch/:batch_id` - Get batch status
- `GET /health` - Health check

## Testing

SeaLog has a comprehensive test suite validating cryptographic correctness:

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- integrity.test.ts
npm test -- verification.concrete.test.ts
```

**Test Results:**
- ✅ **Phase 1: Determinism & Integrity** - 8/8 tests passing
  - Deterministic Merkle roots
  - Append-only enforcement
  - Timestamp manipulation detection
  - Position-preserving hashing
  - Independent offline verification

- ✅ **Phase 2: Research Enhancements** - 20/20 tests passing
  - Genesis chain hash stability
  - Cross-batch hash chaining verification
  - Batch deletion/gap detection
  - Batch tampering & broken link detection
  - Zero-trust proof source validation

- ⏸️ **Phase 2: Blockchain Anchoring** - Pending deployment
- ⏸️ **Phase 3: End-to-End Integration** - Pending deployment

See [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) for complete test documentation.

### Development Commands

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Format code
npm run format
```

## Project Structure

```
SeaLog/
├── src/
│   ├── ingestion/       # Log ingestion API
│   ├── storage/         # Database layer
│   ├── batching/        # Batch processor
│   ├── merkle/          # Merkle tree generation
│   ├── anchoring/       # Ethereum integration
│   ├── verification/    # Proof generation & validation
│   └── types/           # Shared types
├── prisma/
│   ├── schema.prisma    # Database schema
│   └── migrations/      # Schema migrations
├── contracts/           # Solidity smart contracts
├── docs/                # Documentation
│   └── INVARIANTS.md    # System invariants (critical)
└── tests/               # Test files
```

## Security

SeaLog enforces tamper-evidence through:

- **Database-level triggers** preventing log mutation
- **Permission revocation** blocking UPDATE/DELETE/TRUNCATE
- **Dual timestamp model** preventing backdating attacks
- **Position-preserving Merkle hashing** for sound proofs
- **Zero-trust verification** where cached proofs are explicitly ignored
- **Cross-batch hash chaining** preventing entire batch deletion
- **Blockchain anchoring** providing external immutable timestamps

See [docs/INVARIANTS.md](docs/INVARIANTS.md) for security model details.

## Documentation

Comprehensive documentation is available in the `docs/` directory:

- **[INVARIANTS.md](docs/INVARIANTS.md)** - 10 immutable design principles (CRITICAL READ)
- **[TESTING_GUIDE.md](docs/TESTING_GUIDE.md)** - Complete testing methodology
- **[CRYPTOGRAPHIC_VERIFICATION.md](docs/CRYPTOGRAPHIC_VERIFICATION.md)** - Proof of cryptographic correctness with concrete examples
- **[LOG_RETENTION_POLICY.md](docs/LOG_RETENTION_POLICY.md)** - Data retention strategy
- **[DEPLOYMENT.md](docs/DEPLOYMENT.md)** - Deployment procedures and checklist
- **[PRE_DEPLOYMENT_SANITY_CHECK.md](docs/PRE_DEPLOYMENT_SANITY_CHECK.md)** - Pre-deployment verification

## Project Status

**Current Phase:** Testing & Validation (pre-deployment)

**Completed:**
- ✅ All core technical implementation (100%)
- ✅ Research enhancements (Hash chaining, Zero-trust validation)
- ✅ Comprehensive documentation (100%)
- ✅ Cryptographic correctness proven
- ✅ Unit tests passing (28/28 core tests)
- ✅ Smart contract ready for deployment

**Pending:**
- ⏸️ Sepolia testnet deployment
- ⏸️ End-to-end blockchain verification
- ⏸️ Optional: CLI tools, web UI, load testing

**Git Tags:**
- `v1.0.0-crypto-locked` - Cryptographic semantics locked for blockchain anchoring

## License

MIT

## Academic Context

This project was developed as part of a capstone project demonstrating:
- Advanced cryptographic engineering
- Blockchain integration patterns
- Production-grade system design
- Security-first development practices

For academic inquiries or collaboration, see repository contributors.

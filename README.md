# SeaLog - Tamper-Evident Log Integrity System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

SeaLog is a cryptographic integrity layer over logs that provides tamper-evident logging using Merkle trees and Ethereum blockchain anchoring.

## Features

- **Append-Only Logs**: Cryptographically enforced immutability
- **Merkle Tree Commitments**: Efficient batching with O(log N) proof size
- **Blockchain Anchoring**: Immutable timestamping via Ethereum
- **Third-Party Verification**: Independent auditors can verify without trusting SeaLog
- **Tamper Detection**: Any log alteration or deletion is cryptographically detectable

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
3. Dual timestamps in leaf hash (event + ingestion)
4. Merkle internal hash preserves position (no sorting)
5. Proofs are derivable, never trusted from DB

## Usage

### Ingest Logs

```typescript
POST /api/v1/logs/ingest
Content-Type: application/json

{
  "source_service": "auth-service",
  "log_level": "INFO",
  "message": "User logged in",
  "metadata": { "user_id": "12345" }
}
```

### Verify Log

```typescript
GET /api/v1/verify/log/:log_id
```

Returns cryptographic proof including Merkle proof and blockchain anchor.

## Development

```bash
# Run tests
npm test

# Run tests with coverage
npm test:coverage

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
- **Blockchain anchoring** providing external immutable timestamps

See [docs/INVARIANTS.md](docs/INVARIANTS.md) for security model details.

## License

MIT

## Contributing

This is an MVP implementation. Contributions welcome for:
- Performance optimizations
- Additional blockchain integrations
- Enhanced verification UI
- Compliance reporting templates

See implementation plan for roadmap.

import { computeLeafHash } from './src/merkle/implementation';

const log3 = {
  log_id: '550e8400-e29b-41d4-a716-446655440003',
  source_service: 'api-service',
  log_level: 'ERROR' as const,
  message: 'Database connection failed: timeout',
  metadata: { db_host: 'db.prod.example.com', retry_count: 3 },
  timestamp: new Date('2024-01-15T10:30:10.000Z'),
  ingested_at: new Date('2024-01-15T10:30:10.100Z'),
  sequence_number: 1003,
};

console.log('Computing leaf hash for log3...');
const hash = computeLeafHash(log3);
console.log('Result:', hash);

console.log('\nExpected:', '0xdf059626649268ecef594cd03620221a2ba48e714c483254e049f024d3b95816');
console.log('Match:', hash === '0xdf059626649268ecef594cd03620221a2ba48e714c483254e049f024d3b95816');

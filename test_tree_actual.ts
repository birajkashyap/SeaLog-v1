import { buildTree, computeLeafHash } from './src/merkle/implementation';

const log1 = {
  log_id: '550e8400-e29b-41d4-a716-446655440001',
  source_service: 'auth-service',
  log_level: 'INFO' as const,
  message: 'User alice@example.com logged in successfully',
  metadata: { user_id: 'usr_12345', ip: '192.168.1.100' },
  timestamp: new Date('2024-01-15T10:30:00.000Z'),
  ingested_at: new Date('2024-01-15T10:30:01.500Z'),
  sequence_number: 1001,
};

const log2 = {
  log_id: '550e8400-e29b-41d4-a716-446655440002',
  source_service: 'payment-service',
  log_level: 'WARN' as const,
  message: 'Payment gateway timeout after 5 seconds',
  metadata: { transaction_id: 'txn_abc123', amount: 49.99, currency: 'USD' },
  timestamp: new Date('2024-01-15T10:30:05.000Z'),
  ingested_at: new Date('2024-01-15T10:30:05.200Z'),
  sequence_number: 1002,
};

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

console.log('Building tree from 3 logs...');
const tree = buildTree([log1, log2, log3]);

console.log('\nTree leaves:');
tree.leaves.forEach((leaf, i) => console.log(` `, [i], leaf));

console.log('\nTree root from buildTree():');
console.log(' ', tree.root);

console.log('\nTree depth:', tree.depth);

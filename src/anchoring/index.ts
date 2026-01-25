/**
 * Ethereum Anchoring Module
 * 
 * Responsibilities:
 * - Deploy and interact with smart contract
 * - Submit Merkle roots to blockchain
 * - Monitor transaction confirmation
 * - Store blockchain metadata
 * - Handle gas estimation and retry logic
 */

export interface AnchorService {
  /**
   * Anchor a batch's Merkle root to Ethereum
   * INVARIANT: Only the root goes on-chain, never the logs
   */
  anchorBatch(merkleRoot: string, batchId: string): Promise<AnchorResult>;
  
  /**
   * Get anchor status from smart contract
   */
  getAnchorStatus(merkleRoot: string): Promise<AnchorStatus>;
  
  /**
   * Wait for transaction confirmation
   * @param confirmations Number of blocks to wait (recommended: 6)
   */
  waitForConfirmation(txHash: string, confirmations: number): Promise<void>;
  
  /**
   * Verify anchor on-chain (read-only)
   */
  verifyAnchor(merkleRoot: string): Promise<boolean>;
}

export interface AnchorResult {
  tx_hash: string;
  block_number: number;
  gas_used: string;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp?: Date;
}

export interface AnchorStatus {
  is_anchored: boolean;
  merkle_root: string;
  timestamp?: number;        // Block timestamp
  block_number?: number;
  batch_id?: string;
}

export interface BlockchainConfig {
  network: 'sepolia' | 'mainnet' | 'arbitrum' | 'optimism' | 'polygon';
  rpc_url: string;
  contract_address?: string;  // Optional: for existing deployment
  private_key: string;        // Signer key (should use env var)
  gas_limit?: number;
  max_fee_per_gas?: string;
}

/**
 * Smart contract interface
 * See contracts/SeaLogAnchor.sol for implementation
 */
export interface SmartContractInterface {
  /**
   * Submit Merkle root to blockchain
   */
  anchorBatch(merkleRoot: string, batchId: string): Promise<string>; // Returns tx hash
  
  /**
   * Query anchor status
   */
  verifyAnchor(merkleRoot: string): Promise<{
    exists: boolean;
    timestamp: number;
    blockNumber: number;
    batchId: string;
  }>;
  
  /**
   * Check if root is already anchored (prevent duplicates)
   */
  isAnchored(merkleRoot: string): Promise<boolean>;
}

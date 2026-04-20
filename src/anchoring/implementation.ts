/**
 * Ethereum Anchoring Service Implementation
 * 
 * Responsibilities:
 * - Submit Merkle roots to smart contract
 * - Monitor transaction confirmations
 * - Verify anchors on-chain
 */

import { ethers } from 'ethers';
import type { AnchorService, AnchorResult, AnchorStatus, BlockchainConfig } from './index';
import { BlockchainError } from '../types';

// Smart contract ABI (minimal - just what we need)
const SEALOG_ANCHOR_ABI = [
  'function anchorBatch(bytes32 _merkleRoot, bytes32 _batchId) external',
  'function verifyAnchor(bytes32 _merkleRoot) external view returns (bool exists, uint256 timestamp, uint256 blockNumber, bytes32 batchId)',
  'function isAnchored(bytes32 _merkleRoot) external view returns (bool)',
  'event BatchAnchored(bytes32 indexed merkleRoot, bytes32 indexed batchId, uint256 timestamp, uint256 blockNumber)',
];

export class EthereumAnchorService implements AnchorService {
  private provider: ethers.Provider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;
  private config: BlockchainConfig;

  constructor(config: BlockchainConfig) {
    this.config = config;
    
    // Connect to blockchain
    this.provider = new ethers.JsonRpcProvider(config.rpc_url);
    this.wallet = new ethers.Wallet(config.private_key, this.provider);
    
    if (!config.contract_address) {
      throw new BlockchainError('Contract address not configured');
    }
    
    this.contract = new ethers.Contract(
      config.contract_address,
      SEALOG_ANCHOR_ABI,
      this.wallet
    );
  }

  /**
   * Anchor a batch's Merkle root to Ethereum
   */
  async anchorBatch(merkleRoot: string, batchId: string): Promise<AnchorResult> {
    try {
      // Check if already anchored
      const alreadyAnchored = await this.contract.isAnchored(merkleRoot);
      if (alreadyAnchored) {
        throw new BlockchainError(`Root ${merkleRoot} already anchored`);
      }

      // Submit transaction
      // INVARIANT: batchId is a UUID string, but contract expects bytes32.
      // We hash the UUID to get a deterministic 32-byte representation.
      const hashedBatchId = ethers.id(batchId);
      
      const tx = await this.contract.anchorBatch(merkleRoot, hashedBatchId, {
        gasLimit: this.config.gas_limit || 250000,
      });

      console.log(`Transaction submitted: ${tx.hash}`);

      // Get receipt (wait for inclusion in block)
      const receipt = await tx.wait(1);

      return {
        tx_hash: receipt.hash,
        block_number: receipt.blockNumber,
        gas_used: receipt.gasUsed.toString(),
        status: 'confirmed',
        timestamp: new Date(),
      };
    } catch (error: any) {
      throw new BlockchainError(`Failed to anchor batch: ${error.message}`, error);
    }
  }

  /**
   * Get anchor status from smart contract
   */
  async getAnchorStatus(merkleRoot: string): Promise<AnchorStatus> {
    try {
      const result = await this.contract.verifyAnchor(merkleRoot);
      
      return {
        is_anchored: result.exists,
        merkle_root: merkleRoot,
        timestamp: result.exists ? Number(result.timestamp) : undefined,
        block_number: result.exists ? Number(result.blockNumber) : undefined,
        batch_id: result.exists ? result.batchId : undefined,
      };
    } catch (error: any) {
      throw new BlockchainError(`Failed to get anchor status: ${error.message}`, error);
    }
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForConfirmation(txHash: string, confirmations: number = 6): Promise<void> {
    try {
      const tx = await this.provider.getTransaction(txHash);
      if (!tx) {
        throw new BlockchainError(`Transaction ${txHash} not found`);
      }

      console.log(`Waiting for ${confirmations} confirmations...`);
      await tx.wait(confirmations);
      console.log(`Transaction confirmed with ${confirmations} confirmations`);
    } catch (error: any) {
      throw new BlockchainError(`Failed to wait for confirmation: ${error.message}`, error);
    }
  }

  /**
   * Verify anchor on-chain (read-only)
   */
  async verifyAnchor(merkleRoot: string): Promise<boolean> {
    try {
      return await this.contract.isAnchored(merkleRoot);
    } catch (error: any) {
      throw new BlockchainError(`Failed to verify anchor: ${error.message}`, error);
    }
  }

  /**
   * Get Etherscan-like explorer URL for transaction
   */
  getExplorerUrl(txHash: string): string {
    const baseUrls: Record<string, string> = {
      sepolia: 'https://sepolia.etherscan.io',
      mainnet: 'https://etherscan.io',
      arbitrum: 'https://arbiscan.io',
      optimism: 'https://optimistic.etherscan.io',
      polygon: 'https://polygonscan.com',
    };

    const baseUrl = baseUrls[this.config.network] || baseUrls.sepolia;
    return `${baseUrl}/tx/${txHash}`;
  }
}

// Factory function for easy initialization
export function createAnchorService(config?: Partial<BlockchainConfig>): EthereumAnchorService {
  const fullConfig: BlockchainConfig = {
    network: (config?.network || process.env.BLOCKCHAIN_NETWORK || 'sepolia') as any,
    rpc_url: config?.rpc_url || process.env.BLOCKCHAIN_RPC_URL || '',
    contract_address: config?.contract_address || process.env.CONTRACT_ADDRESS,
    private_key: config?.private_key || process.env.BLOCKCHAIN_PRIVATE_KEY || '',
    gas_limit: config?.gas_limit,
  };

  return new EthereumAnchorService(fullConfig);
}

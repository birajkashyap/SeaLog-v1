// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * SeaLog Anchor Contract
 * 
 * Purpose: Store Merkle roots on-chain for immutable timestamping
 * 
 * INVARIANTS:
 * - Only Merkle roots are stored (never full logs)
 * - Each root can only be anchored once
 * - Timestamps are immutable (block.timestamp)
 * - Events provide audit trail
 */
contract SeaLogAnchor {
    struct BatchAnchor {
        bytes32 merkleRoot;
        uint256 timestamp;
        uint256 blockNumber;
        bytes32 batchId;
    }
    
    // Mapping: merkleRoot => BatchAnchor
    mapping(bytes32 => BatchAnchor) public anchors;
    
    // Track which roots have been anchored
    mapping(bytes32 => bool) public isAnchored;
    
    // Events for transparency
    event BatchAnchored(
        bytes32 indexed merkleRoot,
        bytes32 indexed batchId,
        uint256 timestamp,
        uint256 blockNumber
    );
    
    /**
     * Anchor a batch's Merkle root
     * INVARIANT: Can only anchor each root once
     */
    function anchorBatch(bytes32 _merkleRoot, bytes32 _batchId) external {
        require(!isAnchored[_merkleRoot], "Root already anchored");
        require(_merkleRoot != bytes32(0), "Invalid Merkle root");
        
        anchors[_merkleRoot] = BatchAnchor({
            merkleRoot: _merkleRoot,
            timestamp: block.timestamp,
            blockNumber: block.number,
            batchId: _batchId
        });
        
        isAnchored[_merkleRoot] = true;
        
        emit BatchAnchored(
            _merkleRoot,
            _batchId,
            block.timestamp,
            block.number
        );
    }
    
    /**
     * Verify if a Merkle root is anchored
     * Returns anchor details
     */
    function verifyAnchor(bytes32 _merkleRoot) 
        external 
        view 
        returns (
            bool exists,
            uint256 timestamp,
            uint256 blockNumber,
            bytes32 batchId
        ) 
    {
        BatchAnchor memory anchor = anchors[_merkleRoot];
        exists = isAnchored[_merkleRoot];
        timestamp = anchor.timestamp;
        blockNumber = anchor.blockNumber;
        batchId = anchor.batchId;
    }
    
    /**
     * Get full anchor details
     */
    function getAnchor(bytes32 _merkleRoot) 
        external 
        view 
        returns (BatchAnchor memory) 
    {
        require(isAnchored[_merkleRoot], "Root not anchored");
        return anchors[_merkleRoot];
    }
}

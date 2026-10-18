// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../ReserveProofRegistry.sol";

/**
 * @title MockGroth16Verifier
 * @notice Mock verifier for testing contract-level logic and negative rejection cases.
 */
contract MockGroth16Verifier is IGroth16Verifier {
    bool public shouldPass = true;
    uint256 public verifyCallCount;

    function setShouldPass(bool _shouldPass) external {
        shouldPass = _shouldPass;
    }

    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[4] calldata
    ) external override returns (bool) {
        verifyCallCount++;
        return shouldPass;
    }
}

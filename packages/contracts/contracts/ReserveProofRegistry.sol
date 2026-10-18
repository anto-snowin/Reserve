// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IGroth16Verifier
 * @notice Standard interface for snarkjs-generated Groth16 Solidity verifier
 */
interface IGroth16Verifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[4] calldata input
    ) external view returns (bool r);
}

/**
 * @title ReserveProofRegistry
 * @notice On-chain registry for verified privacy-preserving proof-of-reserves and solvency reports.
 *
 * Semantic Guarantees:
 * - A successful record guarantees that the submitted Groth16 cryptographic proof
 *   verified under the deployed verifier for the exact recorded public inputs.
 * - Enforces that declared reserves >= proved liabilities.
 * - Binds the proof to a specific Merkle root and dataset version.
 * - Does NOT prove completeness of exchange liability records or off-chain asset unencumbrance.
 */
contract ReserveProofRegistry {
    IGroth16Verifier public immutable verifier;

    struct SolvencyReport {
        bytes32 merkleRoot;
        uint256 totalLiabilities;
        uint256 declaredReserves;
        uint256 datasetVersion;
        address submitter;
        uint256 timestamp;
    }

    /// @notice Stored reports mapped by dataset version
    mapping(uint256 => SolvencyReport) public reports;

    /// @notice Ordered list of recorded dataset versions
    uint256[] public reportVersions;

    /// @notice Emitted when a valid solvency proof is cryptographically verified and recorded
    event ProofVerified(
        bytes32 indexed merkleRoot,
        uint256 totalLiabilities,
        uint256 declaredReserves,
        uint256 indexed datasetVersion,
        address indexed submitter,
        uint256 timestamp
    );

    // Custom errors for gas efficiency and clear debugging
    error ZeroAddressVerifier();
    error InvalidDatasetVersion();
    error DuplicateDatasetVersion(uint256 datasetVersion);
    error InsufficientReserves(uint256 declaredReserves, uint256 totalLiabilities);
    error InvalidProof();

    constructor(address _verifier) {
        if (_verifier == address(0)) revert ZeroAddressVerifier();
        verifier = IGroth16Verifier(_verifier);
    }

    /**
     * @notice Submit a zero-knowledge solvency proof for verification and on-chain recording.
     * @param a Groth16 proof parameter A
     * @param b Groth16 proof parameter B
     * @param c Groth16 proof parameter C
     * @param publicInputs Public signals:
     *        [0]: merkleRoot (bytes32 commitment to customer balance tree)
     *        [1]: totalLiabilities (sum of all customer liabilities in satoshis)
     *        [2]: declaredReserves (declared reserve assets in satoshis)
     *        [3]: datasetVersion (snapshot epoch identifier)
     */
    function submitSolvencyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[4] calldata publicInputs
    ) external {
        bytes32 merkleRoot = bytes32(publicInputs[0]);
        uint256 totalLiabilities = publicInputs[1];
        uint256 declaredReserves = publicInputs[2];
        uint256 datasetVersion = publicInputs[3];

        // 1. Validate dataset version
        if (datasetVersion == 0) revert InvalidDatasetVersion();
        if (reports[datasetVersion].timestamp != 0) {
            revert DuplicateDatasetVersion(datasetVersion);
        }

        // 2. Enforce solvency coverage rule: reserves must cover liabilities
        if (declaredReserves < totalLiabilities) {
            revert InsufficientReserves(declaredReserves, totalLiabilities);
        }

        // 3. Cryptographic Groth16 verification against deployed verifier
        bool isValid = verifier.verifyProof(a, b, c, publicInputs);
        if (!isValid) {
            revert InvalidProof();
        }

        // 4. Record the verified report
        reports[datasetVersion] = SolvencyReport({
            merkleRoot: merkleRoot,
            totalLiabilities: totalLiabilities,
            declaredReserves: declaredReserves,
            datasetVersion: datasetVersion,
            submitter: msg.sender,
            timestamp: block.timestamp
        });
        reportVersions.push(datasetVersion);

        emit ProofVerified(
            merkleRoot,
            totalLiabilities,
            declaredReserves,
            datasetVersion,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * @notice Get total number of verified reports
     */
    function getReportCount() external view returns (uint256) {
        return reportVersions.length;
    }

    /**
     * @notice Get the most recent verified report
     */
    function getLatestReport() external view returns (SolvencyReport memory) {
        if (reportVersions.length == 0) {
            return SolvencyReport(bytes32(0), 0, 0, 0, address(0), 0);
        }
        uint256 latestVersion = reportVersions[reportVersions.length - 1];
        return reports[latestVersion];
    }

    /**
     * @notice Retrieve paginated report history
     */
    function getReports(uint256 offset, uint256 limit)
        external
        view
        returns (SolvencyReport[] memory)
    {
        uint256 total = reportVersions.length;
        if (offset >= total) {
            return new SolvencyReport[](0);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        uint256 count = end - offset;
        SolvencyReport[] memory result = new SolvencyReport[](count);
        for (uint256 i = 0; i < count; i++) {
            uint256 version = reportVersions[offset + i];
            result[i] = reports[version];
        }
        return result;
    }
}

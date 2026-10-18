import { expect } from 'chai';
import { network } from 'hardhat';

const { ethers, networkHelpers } = await network.create();

describe('ReserveProofRegistry', function () {
  async function deployRegistryFixture() {
    const [deployer, alice, bob] = await ethers.getSigners();

    const mockVerifier = await ethers.deployContract('MockGroth16Verifier');
    const registry = await ethers.deployContract('ReserveProofRegistry', [
      await mockVerifier.getAddress(),
    ]);

    // Sample dummy valid proof parameters
    const a: [bigint, bigint] = [1n, 2n];
    const b: [[bigint, bigint], [bigint, bigint]] = [
      [3n, 4n],
      [5n, 6n],
    ];
    const c: [bigint, bigint] = [7n, 8n];

    const sampleRoot = ethers.keccak256(ethers.toUtf8Bytes('merkleRoot_v1'));
    const totalLiabilities = 1_000_000_000n; // 10 BTC
    const declaredReserves = 1_200_000_000n; // 12 BTC (120% coverage)
    const datasetVersion = 1n;

    const publicInputs: [bigint, bigint, bigint, bigint] = [
      BigInt(sampleRoot),
      totalLiabilities,
      declaredReserves,
      datasetVersion,
    ];

    return {
      registry,
      mockVerifier,
      deployer,
      alice,
      bob,
      a,
      b,
      c,
      sampleRoot,
      totalLiabilities,
      declaredReserves,
      datasetVersion,
      publicInputs,
    };
  }

  describe('Constructor & Initialization', function () {
    it('should set the immutable verifier address correctly', async function () {
      const { registry, mockVerifier } = await networkHelpers.loadFixture(deployRegistryFixture);
      expect(await registry.verifier()).to.equal(await mockVerifier.getAddress());
    });

    it('should revert if initialized with zero address verifier', async function () {
      const Factory = await ethers.getContractFactory('ReserveProofRegistry');
      await expect(
        ethers.deployContract('ReserveProofRegistry', [ethers.ZeroAddress])
      ).to.be.revertedWithCustomError(Factory, 'ZeroAddressVerifier');
    });
  });

  describe('Proof Submission & Verification', function () {
    it('should accept and record a valid proof with sufficient reserves', async function () {
      const {
        registry,
        alice,
        a,
        b,
        c,
        sampleRoot,
        totalLiabilities,
        declaredReserves,
        datasetVersion,
        publicInputs,
      } = await networkHelpers.loadFixture(deployRegistryFixture);

      const tx = registry.connect(alice).submitSolvencyProof(a, b, c, publicInputs);

      await expect(tx)
        .to.emit(registry, 'ProofVerified')
        .withArgs(
          sampleRoot,
          totalLiabilities,
          declaredReserves,
          datasetVersion,
          alice.address,
          (ts: bigint) => ts > 0n
        );

      expect(await registry.getReportCount()).to.equal(1n);

      const report = await registry.reports(datasetVersion);
      expect(report.merkleRoot).to.equal(sampleRoot);
      expect(report.totalLiabilities).to.equal(totalLiabilities);
      expect(report.declaredReserves).to.equal(declaredReserves);
      expect(report.datasetVersion).to.equal(datasetVersion);
      expect(report.submitter).to.equal(alice.address);
      expect(report.timestamp).to.be.greaterThan(0n);

      const latest = await registry.getLatestReport();
      expect(latest.datasetVersion).to.equal(datasetVersion);
    });

    it('should reject proof submission when declared reserves are less than total liabilities', async function () {
      const { registry, a, b, c, sampleRoot } = await networkHelpers.loadFixture(deployRegistryFixture);

      const totalLiabilities = 1_000_000_000n; // 10 BTC
      const insufficientReserves = 800_000_000n; // 8 BTC (80% coverage -> insolvent!)
      const datasetVersion = 2n;

      const publicInputs: [bigint, bigint, bigint, bigint] = [
        BigInt(sampleRoot),
        totalLiabilities,
        insufficientReserves,
        datasetVersion,
      ];

      await expect(
        registry.submitSolvencyProof(a, b, c, publicInputs)
      ).to.be.revertedWithCustomError(registry, 'InsufficientReserves')
        .withArgs(insufficientReserves, totalLiabilities);
    });

    it('should reject proof submission when dataset version is 0', async function () {
      const { registry, a, b, c, sampleRoot, totalLiabilities, declaredReserves } =
        await networkHelpers.loadFixture(deployRegistryFixture);

      const publicInputs: [bigint, bigint, bigint, bigint] = [
        BigInt(sampleRoot),
        totalLiabilities,
        declaredReserves,
        0n, // version 0
      ];

      await expect(
        registry.submitSolvencyProof(a, b, c, publicInputs)
      ).to.be.revertedWithCustomError(registry, 'InvalidDatasetVersion');
    });

    it('should reject duplicate submissions with the same dataset version (replay prevention)', async function () {
      const { registry, a, b, c, publicInputs, datasetVersion } =
        await networkHelpers.loadFixture(deployRegistryFixture);

      await registry.submitSolvencyProof(a, b, c, publicInputs);

      await expect(
        registry.submitSolvencyProof(a, b, c, publicInputs)
      ).to.be.revertedWithCustomError(registry, 'DuplicateDatasetVersion')
        .withArgs(datasetVersion);
    });

    it('should reject submission when the verifier reports an invalid cryptographic proof', async function () {
      const { registry, mockVerifier, a, b, c, publicInputs } =
        await networkHelpers.loadFixture(deployRegistryFixture);

      // Instruct mock verifier to reject proof
      await mockVerifier.setShouldPass(false);

      await expect(
        registry.submitSolvencyProof(a, b, c, publicInputs)
      ).to.be.revertedWithCustomError(registry, 'InvalidProof');
    });
  });

  describe('Report History Queries', function () {
    it('should return empty report when no reports have been submitted', async function () {
      const { registry } = await networkHelpers.loadFixture(deployRegistryFixture);
      const latest = await registry.getLatestReport();
      expect(latest.timestamp).to.equal(0n);
      expect(latest.datasetVersion).to.equal(0n);
    });

    it('should paginate report history accurately with getReports()', async function () {
      const { registry, a, b, c, sampleRoot } = await networkHelpers.loadFixture(deployRegistryFixture);

      // Submit 3 reports with versions 1, 2, 3
      for (let i = 1n; i <= 3n; i++) {
        const publicInputs: [bigint, bigint, bigint, bigint] = [
          BigInt(sampleRoot),
          1_000_000_000n,
          1_500_000_000n,
          i,
        ];
        await registry.submitSolvencyProof(a, b, c, publicInputs);
      }

      expect(await registry.getReportCount()).to.equal(3n);

      const page1 = await registry.getReports(0n, 2n);
      expect(page1.length).to.equal(2);
      expect(page1[0].datasetVersion).to.equal(1n);
      expect(page1[1].datasetVersion).to.equal(2n);

      const page2 = await registry.getReports(2n, 2n);
      expect(page2.length).to.equal(1);
      expect(page2[0].datasetVersion).to.equal(3n);
    });
  });
});

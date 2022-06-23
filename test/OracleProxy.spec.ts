import { expect } from 'chai';
import { ethers } from 'hardhat';
import { constants, utils } from 'ethers';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { OracleProxy, MockOracle } from '../typechain';

describe('OracleProxy', () => {
  let owner: SignerWithAddress;
  let builder: SignerWithAddress;
  let alice: SignerWithAddress;
  let oracleProxy: OracleProxy;
  let mockOracle: MockOracle;

  beforeEach(async () => {
    [owner, builder, alice] = await ethers.getSigners();

    const OracleProxyFactory = await ethers.getContractFactory('OracleProxy');
    oracleProxy = <OracleProxy>await OracleProxyFactory.deploy();

    const MockOracleFactory = await ethers.getContractFactory('MockOracle');
    mockOracle = <MockOracle>await MockOracleFactory.deploy();
  });

  describe('#setBuilder function', () => {
    it('it reverts if msg.sender is not owner', async () => {
      await expect(
        oracleProxy.connect(builder).setBuilder(builder.address),
      ).revertedWith('Ownable: caller is not the owner');
    });

    it('it reverts if builder is address(0)', async () => {
      await expect(
        oracleProxy.connect(owner).setBuilder(constants.AddressZero),
      ).revertedWith('OracleProxy: zero address');
    });

    it('it updates new builder', async () => {
      await oracleProxy.connect(owner).setBuilder(builder.address);

      expect(await oracleProxy.builder()).to.be.equal(builder.address);
    });

    it('it emits event', async () => {
      const tx = await oracleProxy.connect(owner).setBuilder(builder.address);

      await expect(tx)
        .emit(oracleProxy, 'BuilderUpdated')
        .withArgs(builder.address);
    });
  });

  describe('#addOracle function', () => {
    beforeEach(async () => {
      await oracleProxy.setBuilder(builder.address);
    });

    it('it reverts if msg.sender is not owner or builder', async () => {
      await expect(
        oracleProxy
          .connect(alice)
          .addOracle(constants.AddressZero, mockOracle.address),
      ).revertedWith('OracleProxy: invalid permission');
    });

    it('it reverts if oracle is address(0)', async () => {
      await expect(
        oracleProxy
          .connect(owner)
          .addOracle(constants.AddressZero, constants.AddressZero),
      ).revertedWith('OracleProxy: zero address');
    });

    it('it adds new oracle by owner', async () => {
      await oracleProxy
        .connect(owner)
        .addOracle(constants.AddressZero, mockOracle.address);

      expect(await oracleProxy.oracles(constants.AddressZero)).to.be.equal(
        mockOracle.address,
      );
    });

    it('it adds new oracle by builder', async () => {
      await oracleProxy
        .connect(builder)
        .addOracle(constants.AddressZero, mockOracle.address);

      expect(await oracleProxy.oracles(constants.AddressZero)).to.be.equal(
        mockOracle.address,
      );
    });

    it('it emits event', async () => {
      const tx = await oracleProxy
        .connect(owner)
        .addOracle(constants.AddressZero, mockOracle.address);

      await expect(tx)
        .emit(oracleProxy, 'OracleUpdated')
        .withArgs(constants.AddressZero, mockOracle.address);
    });
  });

  describe('#getAmountIn function', () => {
    beforeEach(async () => {
      await oracleProxy
        .connect(owner)
        .addOracle(constants.AddressZero, mockOracle.address);
    });

    it('it reverts if oracle not added', async () => {
      await expect(oracleProxy.getAmountIn(alice.address, 100)).revertedWith(
        'OracleProxy: no oracle set',
      );
    });

    it('it returns amount from added oracle', async () => {
      const price = utils.parseEther('200');
      await mockOracle.setPrice(price);

      expect(
        await oracleProxy.getAmountIn(
          constants.AddressZero,
          utils.parseEther('100'),
        ),
      ).to.be.equal(utils.parseEther('0.5'));
    });
  });
});

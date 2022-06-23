import { expect } from 'chai';
import { ethers } from 'hardhat';
import { constants, utils } from 'ethers';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  OracleProxy,
  MockOracle,
  MockToken,
  LotteryBuilder,
  LotteryBuilder__factory,
  Lottery,
  Lottery__factory,
} from '../typechain';

describe('LotteryBuilder', () => {
  let owner: SignerWithAddress;
  let vrfCoordinator: SignerWithAddress;
  let treasury: SignerWithAddress;
  let keeper: SignerWithAddress;
  let alice: SignerWithAddress;
  let mockLinkToken: MockToken;
  let myToken: MockToken;
  let partnerToken: MockToken;
  let partnerLiquidityPool: SignerWithAddress;
  let partnerStakingPool: SignerWithAddress;
  let partnerTreasury: SignerWithAddress;
  let partnerOracle: MockOracle;
  let oracleProxy: OracleProxy;
  let lotteryBuilder: LotteryBuilder;

  const VRF_FEE = '0';
  const VRF_KEY_HASH =
    '0xf86195cf7690c55907b2b611ebb7343a6f649bff128701cc542f0569e2c549da';
  const LOTTERY_CREATION_FEE = utils.parseEther('1');
  const TICKET_PRICE = utils.parseEther('5'); // $5

  beforeEach(async () => {
    [
      owner,
      vrfCoordinator,
      treasury,
      keeper,
      alice,
      partnerLiquidityPool,
      partnerStakingPool,
      partnerTreasury,
    ] = await ethers.getSigners();

    const OracleProxyFactory = await ethers.getContractFactory('OracleProxy');
    oracleProxy = <OracleProxy>await OracleProxyFactory.deploy();

    const MockTokenFactory = await ethers.getContractFactory('MockToken');
    myToken = <MockToken>await MockTokenFactory.deploy(18);
    partnerToken = <MockToken>await MockTokenFactory.deploy(18);
    mockLinkToken = <MockToken>await MockTokenFactory.deploy(18);

    const MockOracleFactory = await ethers.getContractFactory('MockOracle');
    partnerOracle = <MockOracle>await MockOracleFactory.deploy();

    const LotteryBuilderFactory = await ethers.getContractFactory(
      'LotteryBuilder',
    );

    lotteryBuilder = <LotteryBuilder>(
      await LotteryBuilderFactory.deploy(
        myToken.address,
        treasury.address,
        oracleProxy.address,
        LOTTERY_CREATION_FEE,
        vrfCoordinator.address,
        mockLinkToken.address,
        VRF_KEY_HASH,
        VRF_FEE,
        keeper.address,
      )
    );

    await oracleProxy.setBuilder(lotteryBuilder.address);
  });

  describe('constructor', () => {
    let LotteryBuilderFactory: LotteryBuilder__factory;

    beforeEach(async () => {
      LotteryBuilderFactory = await ethers.getContractFactory('LotteryBuilder');
    });

    it('check initial values', async () => {
      expect(await lotteryBuilder.token()).to.be.equal(myToken.address);
      expect(await lotteryBuilder.treasury()).to.be.equal(treasury.address);
      expect(await lotteryBuilder.oracleProxy()).to.be.equal(
        oracleProxy.address,
      );
      expect(await lotteryBuilder.keeper()).to.be.equal(keeper.address);
      expect(await lotteryBuilder.lotteryCreationFee()).to.be.equal(
        LOTTERY_CREATION_FEE,
      );
      expect(await lotteryBuilder.vrfKeyHash()).to.be.equal(VRF_KEY_HASH);
      expect(await lotteryBuilder.vrfFee()).to.be.equal(VRF_FEE);
    });

    it('it reverts if token is address(0)', async () => {
      await expect(
        LotteryBuilderFactory.deploy(
          constants.AddressZero,
          treasury.address,
          oracleProxy.address,
          LOTTERY_CREATION_FEE,
          vrfCoordinator.address,
          mockLinkToken.address,
          VRF_KEY_HASH,
          VRF_FEE,
          keeper.address,
        ),
      ).revertedWith('LotteryBuilder: zero address');
    });

    it('it reverts if treasury is address(0)', async () => {
      await expect(
        LotteryBuilderFactory.deploy(
          myToken.address,
          constants.AddressZero,
          oracleProxy.address,
          LOTTERY_CREATION_FEE,
          vrfCoordinator.address,
          mockLinkToken.address,
          VRF_KEY_HASH,
          VRF_FEE,
          keeper.address,
        ),
      ).revertedWith('LotteryBuilder: zero address');
    });

    it('it reverts if oracle proxy is address(0)', async () => {
      await expect(
        LotteryBuilderFactory.deploy(
          myToken.address,
          treasury.address,
          constants.AddressZero,
          LOTTERY_CREATION_FEE,
          vrfCoordinator.address,
          mockLinkToken.address,
          VRF_KEY_HASH,
          VRF_FEE,
          keeper.address,
        ),
      ).revertedWith('LotteryBuilder: zero address');
    });

    it('it reverts if keeper is address(0)', async () => {
      await expect(
        LotteryBuilderFactory.deploy(
          myToken.address,
          treasury.address,
          oracleProxy.address,
          LOTTERY_CREATION_FEE,
          vrfCoordinator.address,
          mockLinkToken.address,
          VRF_KEY_HASH,
          VRF_FEE,
          constants.AddressZero,
        ),
      ).revertedWith('LotteryBuilder: zero address');
    });
  });

  describe('#setTreasury function', () => {
    it('it reverts if msg.sender is not owner', async () => {
      await expect(
        lotteryBuilder.connect(alice).setTreasury(alice.address),
      ).revertedWith('Ownable: caller is not the owner');
    });

    it('it reverts if treasury is address(0)', async () => {
      await expect(
        lotteryBuilder.connect(owner).setTreasury(constants.AddressZero),
      ).revertedWith('LotteryBuilder: zero address');
    });

    it('it updates new treasury', async () => {
      await lotteryBuilder.connect(owner).setTreasury(alice.address);

      expect(await lotteryBuilder.treasury()).to.be.equal(alice.address);
    });

    it('it emits event', async () => {
      const tx = await lotteryBuilder.connect(owner).setTreasury(alice.address);

      await expect(tx)
        .emit(lotteryBuilder, 'TreasuryUpdated')
        .withArgs(alice.address);
    });
  });

  describe('#setKeeper function', () => {
    it('it reverts if msg.sender is not owner', async () => {
      await expect(
        lotteryBuilder.connect(alice).setKeeper(alice.address),
      ).revertedWith('Ownable: caller is not the owner');
    });

    it('it reverts if keeper is address(0)', async () => {
      await expect(
        lotteryBuilder.connect(owner).setKeeper(constants.AddressZero),
      ).revertedWith('LotteryBuilder: zero address');
    });

    it('it updates new keeper', async () => {
      await lotteryBuilder.connect(owner).setKeeper(alice.address);

      expect(await lotteryBuilder.keeper()).to.be.equal(alice.address);
    });

    it('it emits event', async () => {
      const tx = await lotteryBuilder.connect(owner).setKeeper(alice.address);

      await expect(tx)
        .emit(lotteryBuilder, 'KeeperUpdated')
        .withArgs(alice.address);
    });
  });

  describe('#setTicketPrice function', () => {
    it('it reverts if msg.sender is not owner', async () => {
      await expect(
        lotteryBuilder.connect(alice).setLotteryCreationFee(0),
      ).revertedWith('Ownable: caller is not the owner');
    });

    it('it updates new creation fee', async () => {
      await lotteryBuilder.connect(owner).setLotteryCreationFee(1);

      expect(await lotteryBuilder.lotteryCreationFee()).to.be.equal(1);
    });

    it('it emits event', async () => {
      const tx = await lotteryBuilder.connect(owner).setLotteryCreationFee(1);

      await expect(tx)
        .emit(lotteryBuilder, 'LotteryCreationFeeUpdated')
        .withArgs(1);
    });
  });

  describe('#setTicketPrice function', () => {
    it('it reverts if msg.sender is not owner', async () => {
      await expect(
        lotteryBuilder.connect(alice).setTicketPrice(TICKET_PRICE),
      ).revertedWith('Ownable: caller is not the owner');
    });

    it('it updates new ticket price', async () => {
      await lotteryBuilder.connect(owner).setTicketPrice(TICKET_PRICE);

      expect(await lotteryBuilder.ticketPrice()).to.be.equal(TICKET_PRICE);
    });

    it('it emits event', async () => {
      const tx = await lotteryBuilder
        .connect(owner)
        .setTicketPrice(TICKET_PRICE);

      await expect(tx)
        .emit(lotteryBuilder, 'TicketPriceUpdated')
        .withArgs(TICKET_PRICE);
    });
  });

  describe('#createLottery function', () => {
    it('it reverts if creation fee not paid', async () => {
      await expect(
        lotteryBuilder
          .connect(alice)
          .createLottery(
            partnerToken.address,
            partnerLiquidityPool.address,
            partnerStakingPool.address,
            partnerTreasury.address,
            partnerOracle.address,
          ),
      ).revertedWith('LotteryBuilder: No enough fee paid for creation');
    });

    it('it reverts if token is addres(0)', async () => {
      await expect(
        lotteryBuilder
          .connect(alice)
          .createLottery(
            constants.AddressZero,
            partnerLiquidityPool.address,
            partnerStakingPool.address,
            partnerTreasury.address,
            partnerOracle.address,
            {
              value: LOTTERY_CREATION_FEE,
            },
          ),
      ).revertedWith('LotteryBuilder: token cannot be zero address');
    });

    it('it creates new lottery', async () => {
      await lotteryBuilder
        .connect(alice)
        .createLottery(
          partnerToken.address,
          partnerLiquidityPool.address,
          partnerStakingPool.address,
          partnerTreasury.address,
          partnerOracle.address,
          {
            value: LOTTERY_CREATION_FEE,
          },
        );

      const lotteryAddr = await lotteryBuilder.lotteries(partnerToken.address);
      expect(lotteryAddr).to.not.equal(constants.AddressZero);
      expect(await lotteryBuilder.tokenPerLotteries(lotteryAddr)).to.equal(
        partnerToken.address,
      );

      const lotteryInstance = new Lottery__factory(alice).attach(lotteryAddr);
      expect(await lotteryInstance.partnerToken()).to.be.equal(
        partnerToken.address,
      );
    });

    it('it adds oracle', async () => {
      await lotteryBuilder
        .connect(alice)
        .createLottery(
          partnerToken.address,
          partnerLiquidityPool.address,
          partnerStakingPool.address,
          partnerTreasury.address,
          partnerOracle.address,
          {
            value: LOTTERY_CREATION_FEE,
          },
        );

      expect(await oracleProxy.oracles(partnerToken.address)).to.be.equal(
        partnerOracle.address,
      );
    });

    it('it emits event', async () => {
      const tx = await lotteryBuilder
        .connect(alice)
        .createLottery(
          partnerToken.address,
          partnerLiquidityPool.address,
          partnerStakingPool.address,
          partnerTreasury.address,
          partnerOracle.address,
          {
            value: LOTTERY_CREATION_FEE,
          },
        );

      const lotteryAddr = await lotteryBuilder.lotteries(partnerToken.address);

      await expect(tx)
        .emit(lotteryBuilder, 'LotteryCreated')
        .withArgs(alice.address, partnerToken.address, lotteryAddr);
    });

    it('it reverts if lottery was already created', async () => {
      await lotteryBuilder
        .connect(alice)
        .createLottery(
          partnerToken.address,
          partnerLiquidityPool.address,
          partnerStakingPool.address,
          partnerTreasury.address,
          partnerOracle.address,
          {
            value: LOTTERY_CREATION_FEE,
          },
        );

      await expect(
        lotteryBuilder
          .connect(alice)
          .createLottery(
            partnerToken.address,
            partnerLiquidityPool.address,
            partnerStakingPool.address,
            partnerTreasury.address,
            partnerOracle.address,
            {
              value: LOTTERY_CREATION_FEE,
            },
          ),
      ).revertedWith('LotteryBuilder: lottery already created');
    });
  });

  describe('#requestRandomness function', () => {
    let lottery: Lottery;

    beforeEach(async () => {
      await lotteryBuilder
        .connect(alice)
        .createLottery(
          partnerToken.address,
          partnerLiquidityPool.address,
          partnerStakingPool.address,
          partnerTreasury.address,
          partnerOracle.address,
          {
            value: LOTTERY_CREATION_FEE,
          },
        );

      lottery = new Lottery__factory(alice).attach(
        await lotteryBuilder.lotteries(partnerToken.address),
      );
    });

    it('it reverts if lottery not registered', async () => {
      await expect(
        lotteryBuilder.connect(alice).requestRandomness(),
      ).revertedWith('LotteryBuilder: lottery not registered');
    });
  });
});

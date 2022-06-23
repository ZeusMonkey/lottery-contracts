import { expect } from 'chai';
import { ethers } from 'hardhat';
import { constants, utils, BigNumberish } from 'ethers';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  getCurrentTime,
  increaseTime,
  getTimeString,
  increaseTo,
  getRequestId,
  generateSeedForResult,
} from './utils';
import {
  OracleProxy,
  MockOracle,
  MockToken,
  LotteryBuilder,
  Lottery,
  Lottery__factory,
  MockLinkToken,
} from '../typechain';

describe('Lottery', () => {
  let owner: SignerWithAddress;
  let vrfCoordinator: SignerWithAddress;
  let treasury: SignerWithAddress;
  let keeper: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let mockLinkToken: MockLinkToken;
  let myToken: MockToken;
  let partnerToken: MockToken;
  let partnerLiquidityPool: SignerWithAddress;
  let partnerStakingPool: SignerWithAddress;
  let partnerTreasury: SignerWithAddress;
  let partnerOracle: MockOracle;
  let myTokenOracle: MockOracle;
  let bnbOracle: MockOracle;
  let oracleProxy: OracleProxy;
  let lotteryBuilder: LotteryBuilder;
  let lottery: Lottery;

  const VRF_FEE = '0';
  const VRF_KEY_HASH =
    '0xf86195cf7690c55907b2b611ebb7343a6f649bff128701cc542f0569e2c549da';
  const LOTTERY_CREATION_FEE = utils.parseEther('1');
  const TICKET_PRICE = utils.parseEther('5'); // $5
  const BNB_PRICE = utils.parseEther('200');
  const PARTNER_TOKEN_PRICE = utils.parseEther('0.1');
  const MY_TOKEN_PRICE = utils.parseEther('0.5');

  const LIQUIDITY_FEE = 1000;
  const STAKING_FEE = 1000;
  const TREASURY_FEE = 1000;
  const BUILDER_FEE = 500;
  const PRIZE = 6500;
  const DENOMINATOR = 10000;
  const PRIZE_PER_TIER = [3500, 1500, 1000, 1000, 3000];

  let wednesdayEndTime: number;
  let saturdayEndTime: number;

  beforeEach(async () => {
    [
      owner,
      vrfCoordinator,
      treasury,
      keeper,
      alice,
      bob,
      carol,
      partnerLiquidityPool,
      partnerStakingPool,
      partnerTreasury,
    ] = await ethers.getSigners();

    const OracleProxyFactory = await ethers.getContractFactory('OracleProxy');
    oracleProxy = <OracleProxy>await OracleProxyFactory.deploy();

    const MockTokenFactory = await ethers.getContractFactory('MockToken');
    myToken = <MockToken>await MockTokenFactory.deploy(18);
    partnerToken = <MockToken>await MockTokenFactory.deploy(18);

    const MockLinkTokenFactory = await ethers.getContractFactory(
      'MockLinkToken',
    );
    mockLinkToken = <MockLinkToken>await MockLinkTokenFactory.deploy();

    myToken.mint(alice.address, utils.parseEther('10000000'));
    partnerToken.mint(alice.address, utils.parseEther('10000000'));
    mockLinkToken.mint(alice.address, utils.parseEther('10000000'));

    myToken.mint(bob.address, utils.parseEther('10000000'));
    partnerToken.mint(bob.address, utils.parseEther('10000000'));
    mockLinkToken.mint(bob.address, utils.parseEther('10000000'));

    myToken.mint(carol.address, utils.parseEther('10000000'));
    partnerToken.mint(carol.address, utils.parseEther('10000000'));
    mockLinkToken.mint(carol.address, utils.parseEther('10000000'));

    const MockOracleFactory = await ethers.getContractFactory('MockOracle');
    partnerOracle = <MockOracle>await MockOracleFactory.deploy();
    myTokenOracle = <MockOracle>await MockOracleFactory.deploy();
    bnbOracle = <MockOracle>await MockOracleFactory.deploy();

    await partnerOracle.setPrice(PARTNER_TOKEN_PRICE);
    await myTokenOracle.setPrice(MY_TOKEN_PRICE);
    await bnbOracle.setPrice(BNB_PRICE);

    await oracleProxy.addOracle(myToken.address, myTokenOracle.address);
    await oracleProxy.addOracle(constants.AddressZero, bnbOracle.address);

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

    await lotteryBuilder.setTicketPrice(TICKET_PRICE);

    await oracleProxy.setBuilder(lotteryBuilder.address);

    let currentTime = await getCurrentTime();
    await increaseTo(Math.floor(currentTime / 604800 + 1) * 604800);

    currentTime = await getCurrentTime();

    wednesdayEndTime =
      Math.floor((currentTime + 10800) / 604800 + 1) * 604800 - 10800;

    saturdayEndTime =
      Math.floor((currentTime + 356400) / 604800 + 1) * 604800 - 356400;

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

  describe('constructor', () => {
    let LotteryFactory: Lottery__factory;

    beforeEach(async () => {
      LotteryFactory = await ethers.getContractFactory('Lottery');
    });

    it('check initial values', async () => {
      expect(await lottery.partnerToken()).to.be.equal(partnerToken.address);
      expect(await lottery.liquidityPool()).to.be.equal(
        partnerLiquidityPool.address,
      );
      expect(await lottery.stakingPool()).to.be.equal(
        partnerStakingPool.address,
      );
      expect(await lottery.treasury()).to.be.equal(partnerTreasury.address);
      expect(await lottery.builder()).to.be.equal(lotteryBuilder.address);

      const currentTime = await getCurrentTime();

      expect(await lottery.wednesdayEndTime()).to.be.equal(wednesdayEndTime);
      expect(await lottery.saturdayEndTime()).to.be.equal(saturdayEndTime);
      expect(await lottery.nextEndTime()).to.be.equal(
        Math.min(wednesdayEndTime, saturdayEndTime),
      );

      console.log('Current time: ', getTimeString(currentTime));
      console.log('Wednesday end time: ', getTimeString(wednesdayEndTime));
      console.log('Saturday end time: ', getTimeString(saturdayEndTime));
    });

    it('it reverts if token is address(0)', async () => {
      await expect(
        LotteryFactory.deploy(
          constants.AddressZero,
          partnerLiquidityPool.address,
          partnerStakingPool.address,
          partnerTreasury.address,
        ),
      ).revertedWith('Lottery: zero address');
    });

    it('it reverts if liquidity pool is address(0)', async () => {
      await expect(
        LotteryFactory.deploy(
          partnerToken.address,
          constants.AddressZero,
          partnerStakingPool.address,
          partnerTreasury.address,
        ),
      ).revertedWith('Lottery: zero address');
    });

    it('it reverts if staking pool is address(0)', async () => {
      await expect(
        LotteryFactory.deploy(
          partnerToken.address,
          partnerLiquidityPool.address,
          constants.AddressZero,
          partnerTreasury.address,
        ),
      ).revertedWith('Lottery: zero address');
    });

    it('it reverts if partner treasury is address(0)', async () => {
      await expect(
        LotteryFactory.deploy(
          partnerToken.address,
          partnerLiquidityPool.address,
          partnerStakingPool.address,
          constants.AddressZero,
        ),
      ).revertedWith('Lottery: zero address');
    });
  });

  describe('#play function', () => {
    beforeEach(async () => {
      await myToken
        .connect(alice)
        .approve(lottery.address, constants.MaxUint256);
      await partnerToken
        .connect(alice)
        .approve(lottery.address, constants.MaxUint256);
    });

    it('it reverts if user trying to play with unregistered tokens (BNB, partner, my token)', async () => {
      await expect(
        lottery.connect(alice).play([1, 2, 3, 4, 5, 6], mockLinkToken.address),
      ).revertedWith('Lottery: Invalid pay token');
    });

    it('it reverts if lottery close in next 30 minutes', async () => {
      await increaseTo((await lottery.nextEndTime()).sub(100));
      await expect(
        lottery.connect(alice).play([1, 2, 3, 4, 5, 6], myToken.address),
      ).revertedWith('Lottery: sale closed');
    });

    it('it reverts if number is out of [1, 59]', async () => {
      await expect(
        lottery.connect(alice).play([0, 2, 3, 4, 5, 6], myToken.address),
      ).revertedWith('Lottery: invalid number input');

      await expect(
        lottery.connect(alice).play([1, 2, 3, 4, 5, 60], myToken.address),
      ).revertedWith('Lottery: invalid number input');
    });

    it('play with bnb token', async () => {
      const amount = TICKET_PRICE.mul(utils.parseEther('1')).div(BNB_PRICE);

      const initialBalance = await partnerLiquidityPool.getBalance();

      await lottery
        .connect(alice)
        .play([1, 2, 3, 4, 5, 6], constants.AddressZero, { value: amount });

      expect(await partnerLiquidityPool.getBalance()).to.be.equal(
        amount.mul(LIQUIDITY_FEE).div(DENOMINATOR).add(initialBalance),
      );
      expect(await partnerStakingPool.getBalance()).to.be.equal(
        amount.mul(STAKING_FEE).div(DENOMINATOR).add(initialBalance),
      );
      expect(await partnerTreasury.getBalance()).to.be.equal(
        amount.mul(TREASURY_FEE).div(DENOMINATOR).add(initialBalance),
      );
      expect(await treasury.getBalance()).to.be.equal(
        amount.mul(BUILDER_FEE).div(DENOMINATOR).add(initialBalance),
      );
      expect(await alice.provider!.getBalance(lottery.address)).to.be.equal(
        amount.mul(PRIZE).div(DENOMINATOR),
      );

      expect((await lottery.getEpochInfo(0)).bnbReward).to.be.equal(
        amount.mul(PRIZE).div(DENOMINATOR),
      );
    });

    it('it reverts if no enough BNB received', async () => {
      const amount = TICKET_PRICE.mul(utils.parseEther('1')).div(BNB_PRICE);

      await expect(
        lottery.connect(alice).play([1, 2, 3, 4, 5, 6], constants.AddressZero, {
          value: amount.sub(1),
        }),
      ).revertedWith('TransferHelper: invalid amount');
    });

    it('it refunds rest BNB', async () => {
      const amount = TICKET_PRICE.mul(utils.parseEther('1')).div(BNB_PRICE);

      const initialBalance = await partnerLiquidityPool.getBalance();
      const initialTreasuryBalance = await treasury.getBalance();

      await lottery
        .connect(alice)
        .play([1, 2, 3, 4, 5, 6], constants.AddressZero, {
          value: amount.add(amount),
        });

      expect(await partnerLiquidityPool.getBalance()).to.be.equal(
        amount.mul(LIQUIDITY_FEE).div(DENOMINATOR).add(initialBalance),
      );
      expect(await partnerStakingPool.getBalance()).to.be.equal(
        amount.mul(STAKING_FEE).div(DENOMINATOR).add(initialBalance),
      );
      expect(await partnerTreasury.getBalance()).to.be.equal(
        amount.mul(TREASURY_FEE).div(DENOMINATOR).add(initialBalance),
      );
      expect(await treasury.getBalance()).to.be.equal(
        amount.mul(BUILDER_FEE).div(DENOMINATOR).add(initialTreasuryBalance),
      );
      expect(await alice.provider!.getBalance(lottery.address)).to.be.equal(
        amount.mul(PRIZE).div(DENOMINATOR),
      );
    });

    it('play with my token', async () => {
      const amount = TICKET_PRICE.mul(utils.parseEther('1')).div(
        MY_TOKEN_PRICE,
      );

      await lottery.connect(alice).play([1, 2, 3, 4, 5, 6], myToken.address);

      expect(await myToken.balanceOf(partnerLiquidityPool.address)).to.be.equal(
        amount.mul(LIQUIDITY_FEE).div(DENOMINATOR),
      );
      expect(await myToken.balanceOf(partnerStakingPool.address)).to.be.equal(
        amount.mul(STAKING_FEE).div(DENOMINATOR),
      );
      expect(await myToken.balanceOf(partnerTreasury.address)).to.be.equal(
        amount.mul(TREASURY_FEE).div(DENOMINATOR),
      );
      expect(await myToken.balanceOf(treasury.address)).to.be.equal(
        amount.mul(BUILDER_FEE).div(DENOMINATOR),
      );
      expect(await myToken.balanceOf(lottery.address)).to.be.equal(
        amount.mul(PRIZE).div(DENOMINATOR),
      );

      expect((await lottery.getEpochInfo(0)).myTokenReward).to.be.equal(
        amount.mul(PRIZE).div(DENOMINATOR),
      );
    });

    it('play with partner token', async () => {
      const amount = TICKET_PRICE.mul(utils.parseEther('1')).div(
        PARTNER_TOKEN_PRICE,
      );

      await lottery
        .connect(alice)
        .play([1, 2, 3, 4, 5, 6], partnerToken.address);

      expect(
        await partnerToken.balanceOf(partnerLiquidityPool.address),
      ).to.be.equal(amount.mul(LIQUIDITY_FEE).div(DENOMINATOR));
      expect(
        await partnerToken.balanceOf(partnerStakingPool.address),
      ).to.be.equal(amount.mul(STAKING_FEE).div(DENOMINATOR));
      expect(await partnerToken.balanceOf(partnerTreasury.address)).to.be.equal(
        amount.mul(TREASURY_FEE).div(DENOMINATOR),
      );
      expect(await partnerToken.balanceOf(treasury.address)).to.be.equal(
        amount.mul(BUILDER_FEE).div(DENOMINATOR),
      );
      expect(await partnerToken.balanceOf(lottery.address)).to.be.equal(
        amount.mul(PRIZE).div(DENOMINATOR),
      );

      expect((await lottery.getEpochInfo(0)).partnerTokenReward).to.be.equal(
        amount.mul(PRIZE).div(DENOMINATOR),
      );
    });

    it('it stores ticket information', async () => {
      const numbers: [
        BigNumberish,
        BigNumberish,
        BigNumberish,
        BigNumberish,
        BigNumberish,
        BigNumberish,
      ] = [5, 2, 10, 20, 40, 14];
      await lottery.connect(alice).play(numbers, partnerToken.address);

      expect(await lottery.lastTicketNum()).to.be.equal(1);
      const ticketInfo = await lottery.getTicketInfo(0);

      expect(ticketInfo._user).to.be.equal(alice.address);
      expect(ticketInfo._epoch).to.be.equal(0);
      for (let i = 0; i < 6; i += 1) {
        expect(ticketInfo._numbers[i]).to.be.equal(numbers[i]);
      }
    });
  });

  describe('#endLottery function', () => {
    beforeEach(async () => {
      await myToken
        .connect(alice)
        .approve(lottery.address, constants.MaxUint256);
      await partnerToken
        .connect(alice)
        .approve(lottery.address, constants.MaxUint256);
    });

    it('it reverts if not ready to end', async () => {
      await expect(lottery.connect(keeper).endLottery()).revertedWith(
        'Lottery: still active',
      );
    });

    it('it reverts if there is at least one ticket saled and mesg.sender is not keeper', async () => {
      await lottery.connect(alice).play([1, 2, 3, 4, 5, 6], myToken.address);

      await increaseTime((await lottery.nextEndTime()).add(10));
      await expect(lottery.connect(alice).endLottery()).revertedWith(
        'Lottery: not keeper',
      );
    });

    it('it just increase epoch if no ticket saled', async () => {
      await increaseTime((await lottery.nextEndTime()).add(10));
      await lottery.connect(keeper).endLottery();

      expect(await lottery.epoch()).to.be.equal(1);
      expect(await lottery.nextEndTime()).to.be.equal(wednesdayEndTime);
      expect(await lottery.saturdayEndTime()).to.be.equal(
        saturdayEndTime + 604800,
      );
      expect(await lottery.wednesdayEndTime()).to.be.equal(wednesdayEndTime);
    });

    it('it requests random number to chainlink', async () => {
      await lottery.connect(alice).play([1, 2, 3, 4, 5, 6], myToken.address);

      await increaseTime((await lottery.nextEndTime()).add(10));

      await lottery.connect(keeper).endLottery();

      const requestId = getRequestId(lotteryBuilder.address, VRF_KEY_HASH, 0);

      expect(await lotteryBuilder.randomRequester(requestId)).to.be.equal(
        lottery.address,
      );

      expect(await lottery.waitingResult()).to.be.true;
    });

    it('it reverts if waiting for result', async () => {
      await lottery.connect(alice).play([1, 2, 3, 4, 5, 6], myToken.address);

      await increaseTime((await lottery.nextEndTime()).add(10));

      await lottery.connect(keeper).endLottery();

      await expect(lottery.connect(keeper).endLottery()).revertedWith(
        'Lottery: waiting result',
      );
    });
  });

  describe('#fulfillRandomness function', () => {
    const aliceNumbers: any = [5, 2, 10, 20, 40, 14];
    const bobNumbers: any = [1, 2, 10, 20, 40, 14];
    const carolNumbers: any = [5, 2, 10, 21, 41, 16];
    let requestId: string;

    beforeEach(async () => {
      await myToken
        .connect(alice)
        .approve(lottery.address, constants.MaxUint256);

      await partnerToken
        .connect(bob)
        .approve(lottery.address, constants.MaxUint256);

      await lottery.connect(alice).play(aliceNumbers, myToken.address);
      await lottery.connect(bob).play(bobNumbers, partnerToken.address);
      await lottery.connect(carol).play(carolNumbers, constants.AddressZero, {
        value: TICKET_PRICE.mul(utils.parseEther('1')).div(BNB_PRICE),
      });

      await increaseTime((await lottery.nextEndTime()).add(10));

      await lottery.connect(keeper).endLottery();

      requestId = getRequestId(lotteryBuilder.address, VRF_KEY_HASH, 0);
    });

    it('it reverts if msg.sender is not builder', async () => {
      await expect(lottery.connect(keeper).fulfillRandomness(10)).revertedWith(
        'Lottery: not builder',
      );
    });

    it('it updates epoch and end time', async () => {
      await lotteryBuilder
        .connect(vrfCoordinator)
        .rawFulfillRandomness(requestId, '100');

      expect(await lottery.epoch()).to.be.equal(1);
      expect(await lottery.nextEndTime()).to.be.equal(wednesdayEndTime);
      expect(await lottery.saturdayEndTime()).to.be.equal(
        saturdayEndTime + 604800,
      );
      expect(await lottery.wednesdayEndTime()).to.be.equal(wednesdayEndTime);
    });

    describe('it updates answers and winner counts', () => {
      it('case 1 (Match2 : 1, Match6: 1)', async () => {
        const randomResult = [5, 2, 10, 20, 40, 14];

        await lotteryBuilder
          .connect(vrfCoordinator)
          .rawFulfillRandomness(requestId, generateSeedForResult(randomResult));

        const epochInfo = await lottery.getEpochInfo(0);

        for (let i = 0; i < randomResult.length; i += 1) {
          expect(epochInfo.answers[i]).to.be.equal(randomResult[i]);
        }

        const expectedWinnerResult = [0, 1, 0, 0, 1];
        for (let i = 0; i < expectedWinnerResult.length; i += 1) {
          expect(epochInfo.winnerCounts[i]).to.be.equal(
            expectedWinnerResult[i],
          );
        }
      });

      it('case 2 (Match2: 2)', async () => {
        const randomResult = [5, 2, 10, 24, 40, 14];

        await lotteryBuilder
          .connect(vrfCoordinator)
          .rawFulfillRandomness(requestId, generateSeedForResult(randomResult));

        const epochInfo = await lottery.getEpochInfo(0);

        for (let i = 0; i < randomResult.length; i += 1) {
          expect(epochInfo.answers[i]).to.be.equal(randomResult[i]);
        }

        const expectedWinnerResult = [0, 2];
        for (let i = 0; i < expectedWinnerResult.length; i += 1) {
          expect(epochInfo.winnerCounts[i]).to.be.equal(
            expectedWinnerResult[i],
          );
        }
      });
    });

    it('it transferes rest funds to treasury', async () => {
      const randomResult = [5, 2, 10, 20, 40, 14];

      const prevBnbBalance = await partnerTreasury.getBalance();
      const partnerTokenBalance = await partnerToken.balanceOf(
        partnerTreasury.address,
      );
      const myTokenBalance = await myToken.balanceOf(partnerTreasury.address);

      await lotteryBuilder
        .connect(vrfCoordinator)
        .rawFulfillRandomness(requestId, generateSeedForResult(randomResult));

      const epochInfo = await lottery.getEpochInfo(0);

      expect(await partnerTreasury.getBalance()).to.be.equal(
        epochInfo.bnbReward.mul(5500).div(DENOMINATOR).add(prevBnbBalance),
      );
      expect(await partnerToken.balanceOf(partnerTreasury.address)).to.be.equal(
        epochInfo.partnerTokenReward
          .mul(5500)
          .div(DENOMINATOR)
          .add(partnerTokenBalance),
      );
      expect(await myToken.balanceOf(partnerTreasury.address)).to.be.equal(
        epochInfo.myTokenReward.mul(5500).div(DENOMINATOR).add(myTokenBalance),
      );
    });
  });

  describe('#claim function', () => {
    const aliceNumbers: any = [5, 2, 10, 20, 40, 14];
    const bobNumbers: any = [5, 1, 10, 20, 40, 14];
    const carolNumbers: any = [5, 2, 10, 21, 41, 16];
    let requestId: string;

    beforeEach(async () => {
      await myToken
        .connect(alice)
        .approve(lottery.address, constants.MaxUint256);

      await partnerToken
        .connect(bob)
        .approve(lottery.address, constants.MaxUint256);

      await lottery.connect(alice).play(aliceNumbers, myToken.address);
      await lottery.connect(bob).play(bobNumbers, partnerToken.address);
      await lottery.connect(carol).play(carolNumbers, constants.AddressZero, {
        value: TICKET_PRICE.mul(utils.parseEther('1')).div(BNB_PRICE),
      });

      await increaseTime((await lottery.nextEndTime()).add(10));

      await lottery.connect(keeper).endLottery();

      requestId = getRequestId(lotteryBuilder.address, VRF_KEY_HASH, 0);

      const randomResult = [5, 2, 10, 24, 40, 14];

      await lotteryBuilder
        .connect(vrfCoordinator)
        .rawFulfillRandomness(requestId, generateSeedForResult(randomResult));

      const epochInfo = await lottery.getEpochInfo(0);

      for (let i = 0; i < randomResult.length; i += 1) {
        expect(epochInfo.answers[i]).to.be.equal(randomResult[i]);
      }

      const expectedWinnerResult = [0, 2];
      for (let i = 0; i < expectedWinnerResult.length; i += 1) {
        expect(epochInfo.winnerCounts[i]).to.be.equal(expectedWinnerResult[i]);
      }
    });

    it('it reverts if msg.sender is not correct user', async () => {
      await expect(lottery.connect(bob).claim(0)).revertedWith(
        'Lottery: invalid owner',
      );
    });

    it('it reverts if matched number is less than 2', async () => {
      await expect(lottery.connect(bob).claim(1)).revertedWith(
        'Lottery: not matching more than 2',
      );
    });

    it('it claims available bnb, partner, my tokens', async () => {
      const epochInfo = await lottery.getEpochInfo(0);

      const prevBnbBalance = await alice.getBalance();
      const partnerTokenBalance = await partnerToken.balanceOf(alice.address);
      const myTokenBalance = await myToken.balanceOf(alice.address);

      await lottery.connect(alice).claim(0, { gasPrice: 0 });

      expect(await partnerToken.balanceOf(alice.address)).to.be.equal(
        partnerTokenBalance.add(
          epochInfo.partnerTokenReward
            .mul(PRIZE_PER_TIER[1])
            .div(DENOMINATOR)
            .div(2),
        ),
      );
      expect(await myToken.balanceOf(alice.address)).to.be.equal(
        myTokenBalance.add(
          epochInfo.myTokenReward
            .mul(PRIZE_PER_TIER[1])
            .div(DENOMINATOR)
            .div(2),
        ),
      );

      expect(await alice.getBalance()).to.be.equal(
        prevBnbBalance.add(
          epochInfo.bnbReward.mul(PRIZE_PER_TIER[1]).div(DENOMINATOR).div(2),
        ),
      );
    });

    it('it reverts if already claimed', async () => {
      await lottery.connect(alice).claim(0);

      await expect(lottery.connect(alice).claim(0)).revertedWith(
        'Lottery: already claimed',
      );
    });
  });
});

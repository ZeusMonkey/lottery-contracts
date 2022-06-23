// SPDX-License-Identifier: Unlicensed.
pragma solidity 0.8.15;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./libraries/TransferHelper.sol";
import "./interfaces/ILotteryBuilder.sol";
import "./interfaces/IOracleProxy.sol";

contract Lottery {
    using SafeERC20 for IERC20;

    event Claimed(
        address indexed user,
        uint64 indexed epoch,
        uint256 indexed ticketNumber
    );

    uint256 constant DENOMINATOR = 10000;
    uint256 public constant LIQUIDITY_FEE = 1000;
    uint256 public constant STAKING_FEE = 1000;
    uint256 public constant TREASURY_FEE = 1000;
    uint256 public constant BUILDER_FEE = 500;
    uint256 public constant PRIZE = 6500;

    uint8 public constant SLOT_COUNT = 6;

    uint256[5] public PRIZE_PER_TIER = [3500, 1500, 1000, 1000, 3000];

    uint8 public constant NUMBER_COUNT = 59;

    address public immutable partnerToken;
    address public immutable liquidityPool;
    address public immutable stakingPool;
    address public immutable treasury;
    ILotteryBuilder public immutable builder;

    uint64 public wednesdayEndTime;
    uint64 public saturdayEndTime;
    uint256 public nextEndTime;
    uint64 public epoch;

    mapping(uint256 => TicketInfo) internal tickets;
    uint256 public lastTicketNum;
    bool public waitingResult;
    mapping(uint64 => mapping(bytes32 => uint256[])) internal numberTree;
    mapping(uint64 => EpochInfo) internal _epochInfos;

    struct TicketInfo {
        address user;
        uint64 epoch;
        uint8[SLOT_COUNT] numbers;
        bool claimed;
    }

    struct EpochInfo {
        uint8[] answers;
        uint256 rawAnswer;
        uint64[] winnerCounts;
        uint256 bnbReward;
        uint256 partnerTokenReward;
        uint256 myTokenReward;
    }

    modifier onlyBuilder() {
        require(msg.sender == address(builder), "Lottery: not builder");
        _;
    }

    constructor(
        address _token,
        address _liquidityPool,
        address _stakingPool,
        address _treasury
    ) {
        require(
            _token != address(0) &&
                _liquidityPool != address(0) &&
                _stakingPool != address(0) &&
                _treasury != address(0),
            "Lottery: zero address"
        );
        partnerToken = _token;
        liquidityPool = _liquidityPool;
        stakingPool = _stakingPool;
        treasury = _treasury;

        builder = ILotteryBuilder(msg.sender);

        wednesdayEndTime = uint64(
            (((block.timestamp + 10800) / 1 weeks) + 1) * 1 weeks - 10800
        );

        saturdayEndTime = uint64(
            (((block.timestamp + 356400) / 1 weeks) + 1) * 1 weeks - 356400
        );

        nextEndTime = wednesdayEndTime < saturdayEndTime
            ? wednesdayEndTime
            : saturdayEndTime;
    }

    function play(uint8[SLOT_COUNT] calldata numbers, address payToken)
        external
        payable
    {
        require(
            payToken == address(0) ||
                payToken == partnerToken ||
                payToken == builder.token(),
            "Lottery: Invalid pay token"
        );
        require(
            block.timestamp <= nextEndTime - 30 minutes,
            "Lottery: sale closed"
        );

        _receiveToken(payToken);
        _storeNumbers(numbers);
    }

    function _receiveToken(address payToken) internal {
        uint256 totalCost = IOracleProxy(builder.oracleProxy()).getAmountIn(
            payToken,
            builder.ticketPrice()
        );

        uint256 receivedAmount = TransferHelper.receiveToken(
            payToken,
            totalCost
        );

        TransferHelper.sendToken(
            payToken,
            liquidityPool,
            (receivedAmount * LIQUIDITY_FEE) / DENOMINATOR
        );
        TransferHelper.sendToken(
            payToken,
            stakingPool,
            (receivedAmount * STAKING_FEE) / DENOMINATOR
        );
        TransferHelper.sendToken(
            payToken,
            treasury,
            (receivedAmount * TREASURY_FEE) / DENOMINATOR
        );
        TransferHelper.sendToken(
            payToken,
            builder.treasury(),
            (receivedAmount * BUILDER_FEE) / DENOMINATOR
        );

        EpochInfo storage _epochInfo = _epochInfos[epoch];
        uint256 priceReward = (receivedAmount * PRIZE) / DENOMINATOR;
        if (payToken == address(0)) {
            _epochInfo.bnbReward += priceReward;
        } else if (payToken == partnerToken) {
            _epochInfo.partnerTokenReward += priceReward;
        } else {
            _epochInfo.myTokenReward += priceReward;
        }
    }

    function _storeNumbers(uint8[SLOT_COUNT] calldata numbers) internal {
        uint64 _epoch = epoch;
        uint256 _lastTicketNum = lastTicketNum;
        tickets[_lastTicketNum].user = msg.sender;
        tickets[_lastTicketNum].epoch = _epoch;
        tickets[_lastTicketNum].numbers = numbers;

        require(
            numbers[0] >= 1 && numbers[0] <= NUMBER_COUNT,
            "Lottery: invalid number input"
        );

        bytes32 numHash = keccak256(abi.encode(numbers[0]));
        for (uint256 i = 1; i < SLOT_COUNT; i += 1) {
            require(
                numbers[i] != 0 && numbers[i] <= NUMBER_COUNT,
                "Lottery: invalid number input"
            );
            numHash = keccak256(abi.encode(numHash, numbers[i]));
            numberTree[_epoch][numHash].push(_lastTicketNum);
        }

        lastTicketNum++;
    }

    function endLottery() external {
        require(!waitingResult, "Lottery: waiting result");
        require(block.timestamp >= nextEndTime, "Lottery: still active");

        EpochInfo memory _epochInfo = _epochInfos[epoch];
        if (
            _epochInfo.bnbReward == 0 &&
            _epochInfo.myTokenReward == 0 &&
            _epochInfo.partnerTokenReward == 0
        ) {
            epoch += 1;

            if (nextEndTime == wednesdayEndTime) {
                wednesdayEndTime += 1 weeks;
                nextEndTime = saturdayEndTime;
            } else {
                saturdayEndTime += 1 weeks;
                nextEndTime = wednesdayEndTime;
            }
        } else {
            require(msg.sender == builder.keeper(), "Lottery: not keeper");

            waitingResult = true;
            builder.requestRandomness();
        }
    }

    function claim(uint256 ticketNum) external {
        TicketInfo storage _ticketInfo = tickets[ticketNum];
        require(_ticketInfo.user == msg.sender, "Lottery: invalid owner");
        require(!_ticketInfo.claimed, "Lottery: already claimed");

        _ticketInfo.claimed = true;
        EpochInfo memory _epochInfo = _epochInfos[_ticketInfo.epoch];
        require(_epochInfo.rawAnswer != 0, "Lottery: Epoch not ended");

        uint8[] memory answers = _epochInfo.answers;

        uint8 matchCount;
        for (uint8 i = 0; i < answers.length; i += 1) {
            if (_ticketInfo.numbers[i] == answers[i]) {
                unchecked {
                    matchCount += 1;
                }
            } else {
                break;
            }
        }

        require(matchCount > 1, "Lottery: not matching more than 2");

        uint256 prizePercentage = PRIZE_PER_TIER[matchCount - 2];
        uint256 winnerCount = _epochInfo.winnerCounts[matchCount - 2];
        uint256 denom = DENOMINATOR * winnerCount;
        uint256 bnbPrize = (_epochInfo.bnbReward * prizePercentage) / denom;
        uint256 partnerTokenPrize = (_epochInfo.partnerTokenReward *
            prizePercentage) / denom;

        TransferHelper.sendToken(address(0), msg.sender, bnbPrize);
        TransferHelper.sendToken(partnerToken, msg.sender, partnerTokenPrize);

        if (partnerToken != builder.token()) {
            uint256 myTokenPrize = (_epochInfo.myTokenReward *
                prizePercentage) / denom;
            TransferHelper.sendToken(builder.token(), msg.sender, myTokenPrize);
        }

        emit Claimed(msg.sender, _ticketInfo.epoch, ticketNum);
    }

    function fulfillRandomness(uint256 randomNumber) external onlyBuilder {
        require(msg.sender == address(builder), "Lottery: not builder");
        require(waitingResult, "Lottery: not requested result");

        uint64 _epoch = epoch;

        if (nextEndTime == wednesdayEndTime) {
            wednesdayEndTime += 1 weeks;
            nextEndTime = saturdayEndTime;
        } else {
            saturdayEndTime += 1 weeks;
            nextEndTime = wednesdayEndTime;
        }

        bytes32 numHash;

        EpochInfo storage _epochInfo = _epochInfos[_epoch];
        _epochInfo.rawAnswer = randomNumber;

        for (uint8 i = 0; i < SLOT_COUNT; i += 1) {
            uint8 rand = uint8(randomNumber % NUMBER_COUNT) + 1;
            randomNumber /= NUMBER_COUNT;

            if (i == 0) {
                numHash = keccak256(abi.encode(rand));
            } else {
                numHash = keccak256(abi.encode(numHash, rand));

                uint64 winners = uint64(numberTree[_epoch][numHash].length);
                if (winners == 0) {
                    break;
                }

                _epochInfo.winnerCounts.push(winners);
                if (i > 1) {
                    _epochInfo.winnerCounts[i - 2] -= winners;
                }
            }

            _epochInfo.answers.push(rand);
        }

        uint256 unpaidBnb;
        uint256 unapidPartherToken;
        uint256 unpaidMyToken;

        uint256 winnerLength = _epochInfo.winnerCounts.length;

        bool myTokenLottery = partnerToken == builder.token();

        for (uint8 i = 0; i < 5; i += 1) {
            if (i >= winnerLength || _epochInfo.winnerCounts[i] == 0) {
                unpaidBnb +=
                    (_epochInfo.bnbReward * PRIZE_PER_TIER[i]) /
                    DENOMINATOR;
                unapidPartherToken +=
                    (_epochInfo.partnerTokenReward * PRIZE_PER_TIER[i]) /
                    DENOMINATOR;

                if (!myTokenLottery) {
                    unpaidMyToken +=
                        (_epochInfo.myTokenReward * PRIZE_PER_TIER[i]) /
                        DENOMINATOR;
                }
            }
        }

        TransferHelper.sendToken(address(0), treasury, unpaidBnb);
        TransferHelper.sendToken(partnerToken, treasury, unapidPartherToken);
        if (!myTokenLottery) {
            TransferHelper.sendToken(builder.token(), treasury, unpaidMyToken);
        }

        epoch++;

        waitingResult = false;
    }

    function getTicketInfo(uint256 ticketNum)
        external
        view
        returns (
            address _user,
            uint64 _epoch,
            uint8[SLOT_COUNT] memory _numbers
        )
    {
        _user = tickets[ticketNum].user;
        _epoch = tickets[ticketNum].epoch;
        _numbers = tickets[ticketNum].numbers;
    }

    function getEpochInfo(uint64 _epoch)
        external
        view
        returns (
            uint8[] memory answers,
            uint64[] memory winnerCounts,
            uint256 bnbReward,
            uint256 partnerTokenReward,
            uint256 myTokenReward
        )
    {
        EpochInfo memory _epochInfo = _epochInfos[_epoch];

        winnerCounts = _epochInfo.winnerCounts;
        bnbReward = _epochInfo.bnbReward;
        partnerTokenReward = _epochInfo.partnerTokenReward;
        myTokenReward = _epochInfo.myTokenReward;

        if (_epochInfo.rawAnswer != 0) {
            answers = new uint8[](SLOT_COUNT);

            uint256 randomNumber = _epochInfo.rawAnswer;

            for (uint8 i = 0; i < SLOT_COUNT; i += 1) {
                uint8 rand = uint8(randomNumber % NUMBER_COUNT) + 1;
                randomNumber /= NUMBER_COUNT;
                answers[i] = rand;
            }
        }
    }
}

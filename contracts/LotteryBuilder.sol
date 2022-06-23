// SPDX-License-Identifier: Unlicensed.
pragma solidity 0.8.15;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/LinkTokenInterface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBase.sol";
import "./Lottery.sol";
import "./interfaces/ILotteryBuilder.sol";
import "./interfaces/IOracleProxy.sol";

contract LotteryBuilder is Ownable, VRFConsumerBase, ILotteryBuilder {
    event TreasuryUpdated(address indexed treasury);
    event KeeperUpdated(address indexed keeper);
    event LotteryCreationFeeUpdated(uint256 lotteryCreationFee);
    event TicketPriceUpdated(uint256 ticketPrice);
    event LotteryCreated(
        address indexed creator,
        address indexed token,
        address indexed lottery
    );

    address public immutable override token;
    address public immutable override oracleProxy;
    address public override treasury;
    uint256 public override ticketPrice;
    uint256 public lotteryCreationFee;
    bytes32 public immutable vrfKeyHash;
    uint256 public immutable vrfFee;
    address public override keeper;

    mapping(address => address) public lotteries;
    mapping(address => address) public tokenPerLotteries;
    mapping(bytes32 => address) public randomRequester;

    constructor(
        address _token,
        address _treasury,
        address _oracleProxy,
        uint256 _lotteryCreationFee,
        address _vrfCoordinator,
        address _linkToken,
        bytes32 _vrfKeyhash,
        uint256 _vrfFee,
        address _keeper
    ) VRFConsumerBase(_vrfCoordinator, _linkToken) {
        require(
            _token != address(0) &&
                _treasury != address(0) &&
                _oracleProxy != address(0) &&
                _keeper != address(0),
            "LotteryBuilder: zero address"
        );

        token = _token;
        treasury = _treasury;
        oracleProxy = _oracleProxy;
        lotteryCreationFee = _lotteryCreationFee;
        keeper = _keeper;

        vrfKeyHash = _vrfKeyhash;
        vrfFee = _vrfFee;
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "LotteryBuilder: zero address");

        treasury = _treasury;

        emit TreasuryUpdated(_treasury);
    }

    function setKeeper(address _keeper) external onlyOwner {
        require(_keeper != address(0), "LotteryBuilder: zero address");

        keeper = _keeper;

        emit KeeperUpdated(_keeper);
    }

    function setLotteryCreationFee(uint256 _lotteryCreationFee)
        external
        onlyOwner
    {
        lotteryCreationFee = _lotteryCreationFee;

        emit LotteryCreationFeeUpdated(_lotteryCreationFee);
    }

    function setTicketPrice(uint256 _ticketPrice) external onlyOwner {
        ticketPrice = _ticketPrice;

        emit TicketPriceUpdated(_ticketPrice);
    }

    function createLottery(
        address _token,
        address _liquidityPool,
        address _stakingPool,
        address _treasury,
        address _oracle
    ) external payable {
        require(
            msg.value == lotteryCreationFee,
            "LotteryBuilder: No enough fee paid for creation"
        );
        require(
            _token != address(0),
            "LotteryBuilder: token cannot be zero address"
        );
        require(
            lotteries[_token] == address(0),
            "LotteryBuilder: lottery already created"
        );
        if (_oracle != address(0)) {
            IOracleProxy(oracleProxy).addOracle(_token, _oracle);
        }

        address newLottery = address(
            new Lottery(_token, _liquidityPool, _stakingPool, _treasury)
        );

        lotteries[_token] = newLottery;
        tokenPerLotteries[newLottery] = _token;

        emit LotteryCreated(msg.sender, _token, newLottery);
    }

    function requestRandomness() external override {
        require(
            tokenPerLotteries[msg.sender] != address(0),
            "LotteryBuilder: lottery not registered"
        );

        bytes32 requestId = requestRandomness(vrfKeyHash, vrfFee);

        randomRequester[requestId] = msg.sender;
    }

    function fulfillRandomness(bytes32 requestId, uint256 randomNumber)
        internal
        override
    {
        require(
            randomRequester[requestId] != address(0),
            "LotteryBuilder: no request"
        );
        Lottery(randomRequester[requestId]).fulfillRandomness(randomNumber);

        delete randomRequester[requestId];
    }
}

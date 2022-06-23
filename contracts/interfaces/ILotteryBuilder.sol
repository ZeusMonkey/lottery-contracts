// SPDX-License-Identifier: Unlicensed.
pragma solidity 0.8.15;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ILotteryBuilder {
    function token() external view returns (address);

    function treasury() external view returns (address);

    function oracleProxy() external view returns (address);

    function ticketPrice() external view returns (uint256);

    function keeper() external view returns (address);

    function requestRandomness() external;
}

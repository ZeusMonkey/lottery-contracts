// SPDX-License-Identifier: Unlicensed.
pragma solidity 0.8.15;

interface IOracle {
    function getAmountIn(uint256 amountIn) external view returns (uint256);
}

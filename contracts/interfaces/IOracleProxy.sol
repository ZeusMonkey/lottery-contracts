// SPDX-License-Identifier: Unlicensed.
pragma solidity 0.8.15;

interface IOracleProxy {
    function addOracle(address token, address oracle) external;

    function getAmountIn(address token, uint256 amountIn)
        external
        view
        returns (uint256);
}

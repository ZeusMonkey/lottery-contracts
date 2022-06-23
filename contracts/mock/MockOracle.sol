// SPDX-License-Identifier: Unlicensed.
pragma solidity 0.8.15;

import "../interfaces/IOracle.sol";

contract MockOracle is IOracle {
    uint256 internal price;

    function setPrice(uint256 _price) external {
        price = _price;
    }

    function getAmountIn(uint256 amountUsd)
        external
        view
        override
        returns (uint256)
    {
        return (amountUsd * 1e18) / price;
    }
}

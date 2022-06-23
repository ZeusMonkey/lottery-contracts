// SPDX-License-Identifier: Unlicensed.
pragma solidity 0.8.15;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "../interfaces/IOracle.sol";

contract ChainlinkOracle is IOracle {
    AggregatorV3Interface public immutable usdPriceAggregator;
    uint256 internal immutable decimalsMultiplier;
    uint256 internal immutable decimalsDenominator;
    uint8 constant USD_DECIMALS = 18;

    constructor(AggregatorV3Interface _usdPriceAggregator, uint8 _tokenDecimal)
    {
        require(
            address(_usdPriceAggregator) != address(0),
            "ChainlinkOracle: zero address"
        );

        usdPriceAggregator = _usdPriceAggregator;
        uint8 aggregatorDecimals = _usdPriceAggregator.decimals();

        uint256 _decimalsMultiplier;
        uint256 _decimalsDenominator;

        unchecked {
            if (_tokenDecimal == USD_DECIMALS) {
                _decimalsMultiplier = 10**aggregatorDecimals;
                _decimalsDenominator = 1;
            } else if (_tokenDecimal < USD_DECIMALS) {
                if (USD_DECIMALS - _tokenDecimal > aggregatorDecimals) {
                    _decimalsMultiplier = 1;
                    _decimalsDenominator =
                        10**(USD_DECIMALS - _tokenDecimal - aggregatorDecimals);
                } else {
                    _decimalsMultiplier =
                        10**(aggregatorDecimals - USD_DECIMALS - _tokenDecimal);
                    _decimalsDenominator = 1;
                }
            } else {
                _decimalsMultiplier =
                    10**(aggregatorDecimals + _tokenDecimal - USD_DECIMALS);
                _decimalsDenominator = 1;
            }
        }

        decimalsMultiplier = _decimalsMultiplier;
        decimalsDenominator = _decimalsDenominator;
    }

    function getAmountIn(uint256 amountUsd)
        external
        view
        override
        returns (uint256)
    {
        (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = usdPriceAggregator.latestRoundData();
        require(
            roundId == answeredInRound && answer > 0 && updatedAt >= startedAt,
            "ChainlinkOracle: chainlink price is invalid"
        );

        return
            (amountUsd * decimalsMultiplier) /
            (uint256(answer) * decimalsDenominator);
    }
}

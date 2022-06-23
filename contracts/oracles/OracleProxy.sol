// SPDX-License-Identifier: Unlicensed.
pragma solidity 0.8.15;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IOracle.sol";
import "../interfaces/IOracleProxy.sol";

contract OracleProxy is Ownable, IOracleProxy {
    event BuilderUpdated(address indexed builder);
    event OracleUpdated(address indexed token, address indexed oracle);

    address public builder;
    mapping(address => IOracle) public oracles;

    function setBuilder(address _builder) external onlyOwner {
        require(_builder != address(0), "OracleProxy: zero address");

        builder = _builder;

        emit BuilderUpdated(_builder);
    }

    function addOracle(address token, address oracle) external override {
        require(
            msg.sender == owner() || msg.sender == builder,
            "OracleProxy: invalid permission"
        );
        require(oracle != address(0), "OracleProxy: zero address");

        oracles[token] = IOracle(oracle);

        emit OracleUpdated(token, oracle);
    }

    function getAmountIn(address token, uint256 amountUsd)
        external
        view
        override
        returns (uint256)
    {
        require(
            address(oracles[token]) != address(0),
            "OracleProxy: no oracle set"
        );

        return oracles[token].getAmountIn(amountUsd);
    }
}

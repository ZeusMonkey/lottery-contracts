// SPDX-License-Identifier: Unlicensed.
pragma solidity 0.8.15;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20("MockToken", "mToken") {
    uint8 private decimals__;

    constructor(uint8 _decimals) {
        decimals__ = _decimals;
    }

    function decimals() public view override returns (uint8) {
        return decimals__;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

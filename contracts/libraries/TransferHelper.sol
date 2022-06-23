// SPDX-License-Identifier: Unlicensed.
pragma solidity 0.8.15;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

library TransferHelper {
    using SafeERC20 for IERC20;

    function receiveToken(address token, uint256 amount)
        internal
        returns (uint256 receivedAmount)
    {
        if (amount == 0) {
            return 0;
        }
        if (token == address(0)) {
            require(msg.value >= amount, "TransferHelper: invalid amount");
            if (msg.value > amount) {
                (bool success, ) = msg.sender.call{value: msg.value - amount}(
                    ""
                );
                require(success, "TransferHelper: pay back failed");
            }
            receivedAmount = amount;
        } else {
            require(msg.value == 0, "TransferHelper: invalid ether");
            uint256 currentBalance = IERC20(token).balanceOf(address(this));
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
            receivedAmount =
                IERC20(token).balanceOf(address(this)) -
                currentBalance;
        }
    }

    function sendToken(
        address token,
        address recipient,
        uint256 amount
    ) internal {
        if (amount == 0) {
            return;
        }
        if (token == address(0)) {
            (bool success, ) = recipient.call{value: amount}("");
            require(success, "TransferHelper: transfer failed");
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }
    }
}

# Lottery contract

## Lottery Builder

The contract where partners can create lottery.

Lottery creators need to provide token address, liquidity pool, staking pool, treasury and oracle to get token amount from USD ticket price.

When they create lottery, they need to pay creation fee in BNB.

## Lottery

The contract where users can play with BNB, myToken or partnerToken.
The prize will be paid in these 3 tokens depends on received amount.

If there are rest prize which means no winner for that price port, then it will be transfered to partner treasury address.

## OracleProxy

The oracle proxy contract to convert USD amount in to specific token.

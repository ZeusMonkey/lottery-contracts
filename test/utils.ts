import { BigNumberish, utils, BigNumber } from 'ethers';
import { ethers } from 'hardhat';

export const getCurrentTime = async (): Promise<number> =>
  (await ethers.provider.getBlock(await ethers.provider.getBlockNumber()))
    .timestamp;

export const increaseTime = async (seconds: BigNumberish): Promise<void> => {
  await ethers.provider.send('evm_increaseTime', [Number(seconds.toString())]);
  await ethers.provider.send('evm_mine', []);
};

export const increaseTo = async (to: BigNumberish): Promise<void> => {
  const currentTime = await getCurrentTime();
  if (Number(to.toString()) - currentTime) {
    await increaseTime(Number(to.toString()) - currentTime);
  }
};

export const getTimeString = (seconds: BigNumberish): string => {
  const date = new Date(Number(seconds.toString()) * 1000);
  return date.toISOString();
};

export const getRequestId = (
  contractAddr: string,
  vrfKeyHash: string,
  nonce: number,
): string => {
  const vrfSeed = BigNumber.from(
    utils.keccak256(
      utils.defaultAbiCoder.encode(
        ['bytes32', 'uint256', 'address', 'uint256'],
        [vrfKeyHash, 0, contractAddr, nonce],
      ),
    ),
  );

  return utils.solidityKeccak256(['bytes32', 'uint256'], [vrfKeyHash, vrfSeed]);
};

export const generateSeedForResult = (results: number[]): BigNumber => {
  let num: BigNumber = BigNumber.from(0);
  for (let i = results.length - 1; i >= 0; i -= 1) {
    num = num.mul(59).add(results[i] - 1);
  }

  return num;
};

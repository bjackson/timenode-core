import { EAC, Util } from '@ethereum-alarm-clock/lib';
import BN from 'bn.js';
import { providerUrl } from '../helpers';

const web3 = Util.getWeb3FromProviderUrl(providerUrl);

export const SCHEDULED_TX_PARAMS = {
  callValue: new BN(10).pow(new BN(18))
};

export const scheduleTestTx = async (blocksInFuture = 270) => {
  const eac = new EAC(web3);

  const { callValue } = SCHEDULED_TX_PARAMS;

  const callGas = new BN(1000000);
  const gasPrice = new BN(web3.utils.toWei('20', 'gwei'));
  const fee = new BN(0);
  const bounty = new BN(web3.utils.toWei('0.1', 'ether'));

  const accounts = await web3.eth.getAccounts();
  const mainAccount = accounts[0];

  const receipt = await eac.schedule({
    from: mainAccount,
    toAddress: mainAccount,
    callGas,
    callValue,
    windowSize: new BN(30),
    windowStart: new BN((await web3.eth.getBlockNumber()) + blocksInFuture),
    gasPrice,
    fee,
    bounty,
    requiredDeposit: new BN('0'),
    timestampScheduling: false
  });

  return eac.getTxRequestFromReceipt(receipt);
};

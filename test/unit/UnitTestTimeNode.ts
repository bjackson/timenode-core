import { expect, assert } from 'chai';
import { TimeNode, Config } from '../../src/index';
import { mockConfig } from '../helpers';
import BN from 'bn.js';
import { TxStatus } from '../../src/Enum';
import { Util } from '@ethereum-alarm-clock/lib';

let config: Config;
let myAccount: string;
let timenode: TimeNode;
const emitEvents = {
  emitClose: (self: any) => {
    self.emit('close');
  },
  emitEnd: (self: any) => {
    self.connection._client.emit('connectFailed');
  },
  emitError: (self: any) => {
    //Trigger connection failed event
    self.connection._client.emit('connectFailed');
  }
};

before(async () => {
  config = await mockConfig();
  myAccount = config.wallet.getAddresses()[0];
  timenode = new TimeNode(config);
});

describe('TimeNode Unit Tests', () => {
  it('initializes a basic timenode', () => {
    expect(timenode).to.exist; // tslint:disable-line no-unused-expression
  });

  describe('startScanning()', () => {
    it('returns true when started scanning', async () => {
      assert.isTrue(await timenode.startScanning());
      assert.isTrue(timenode.scanner.scanning);
    }).timeout(5000);

    it('hard resets the scanner module when already scanning', async () => {
      timenode.scanner.scanning = true;
      assert.isTrue(await timenode.startScanning());
      assert.isTrue(timenode.scanner.scanning);
    }).timeout(5000);
  });

  describe('startClaiming()', () => {
    it('returns false when stopped scanning', async () => {
      assert.isFalse(await timenode.stopScanning());
    }).timeout(5000);
  });

  describe('startClaiming()', () => {
    it('returns true when started claiming', () => {
      assert.isTrue(timenode.startClaiming());
      assert.isTrue(timenode.config.claiming);
    });
  });

  describe('stopClaiming()', () => {
    it('returns false when stopped claiming', () => {
      assert.isFalse(timenode.stopClaiming());
      assert.isFalse(timenode.config.claiming);
    });
  });

  describe('logNetwork()', () => {
    it('logs the network id', async () => {
      let networkLogged = false;

      timenode.config.logger.info = () => {
        networkLogged = true;
      };

      timenode.config.web3.eth.net.getId = () => Promise.resolve(1);

      await timenode.logNetwork();
      assert.isTrue(networkLogged);
    });
  });

  describe('getClaimedNotExecutedTransactions()', () => {
    beforeEach(async () => {
      config = await mockConfig();
      timenode = new TimeNode(config);
      timenode.config.statsDb.clearAll();
    });

    it('returns 0 when no transactions', () => {
      const txs = timenode.getClaimedNotExecutedTransactions()[myAccount];
      assert.equal(txs.length, 0);
    });

    it('returns a transaction', () => {
      const tx = {
        bounty: new BN(10e9), // 10 gwei
        temporalUnit: 1,
        claimedBy: config.wallet.getAddresses()[0],
        wasCalled: false,
        windowStart: new BN(10000),
        claimWindowStart: new BN(9000),
        status: TxStatus.FreezePeriod
      };
      config.cache.set('tx', tx);

      const txs = timenode.getClaimedNotExecutedTransactions()[myAccount];
      assert.equal(txs.length, 1);
    });
  });

  describe('getUnsucessfullyClaimedTransactions()', () => {
    it('returns empty array when no failed claims', () => {
      const txs = timenode.getUnsucessfullyClaimedTransactions()[myAccount];
      assert.equal(txs.length, 0);
    });

    it('returns failed claims when they are present', () => {
      const failedClaimAddress = '0xe87529a6123a74320e13a6dabf3606630683c029';

      config.statsDb.claimed(config.wallet.getAddresses()[0], failedClaimAddress, new BN(0), false);

      const txs = timenode.getUnsucessfullyClaimedTransactions()[myAccount];
      assert.equal(txs.length, 1);

      assert.deepEqual(txs, ['0xe87529a6123a74320e13a6dabf3606630683c029']);
    });
  });

  describe('handleDisconnections', () => {
    it('detects Error  Disconnect', async () => {
      const newconfig = await mockConfig();
      if (!Util.isWSConnection(newconfig.providerUrls[0])) {
        return;
      }
      const runningNode = new TimeNode(newconfig);
      let triggered: boolean;
      await runningNode.startScanning();
      assert.isTrue(runningNode.scanner.scanning);
      Object.assign(runningNode.wsReconnect, {
        handleWsDisconnect: () => {
          triggered = true;
          runningNode.stopScanning();
        }
      });
      emitEvents.emitError(runningNode.config.web3.currentProvider);
      setTimeout(() => {
        assert.isTrue(triggered, 'Disconnect not detected');
      }, 7000);
    });

    it('detects End  Disconnect', async () => {
      const newconfig = await mockConfig();
      if (!Util.isWSConnection(newconfig.providerUrls[0])) {
        return;
      }
      const runningNode = new TimeNode(newconfig);
      let triggered: boolean;
      await runningNode.startScanning();
      assert.isTrue(runningNode.scanner.scanning);
      Object.assign(runningNode.wsReconnect, {
        handleWsDisconnect: () => {
          triggered = true;
          runningNode.stopScanning();
        }
      });
      emitEvents.emitEnd(runningNode.config.web3.currentProvider);
      setTimeout(() => {
        assert.isTrue(triggered, 'Disconnect not detected');
      }, 7000);
    });

    it('does not restart connection on stop Timenode', async () => {
      const newconfig = await mockConfig();
      if (!Util.isWSConnection(newconfig.providerUrls[0])) {
        return;
      }
      const runningNode = new TimeNode(newconfig);
      let triggered: boolean;
      await runningNode.startScanning();
      assert.isTrue(runningNode.scanner.scanning);
      Object.assign(runningNode, {
        wsReconnect: () => {
          triggered = true;
        }
      });
      runningNode.stopScanning();
      assert.isUndefined(triggered, 'Invalid Disconnect detected');
    });
  });
});

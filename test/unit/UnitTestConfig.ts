/* tslint:disable:no-unused-expressions */
import chai, { expect, assert } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import Config from '../../src/Config';
import { DefaultLogger } from '../../src/Logger';
import { PRIVATE_KEY, providerUrl } from '../helpers';
import BN from 'bn.js';

chai.use(chaiAsPromised);

const WALLET_PASSWD = 'Wak9bk7DwZYL';
const WALLET_KEYSTORE = `{"address":"5e99853e1e962cca2dc74ec91f1cbadaadc0c2c0","id":"49763e7d-4913-4d35-9d4c-bd67d7ec8a27","version":3,"Crypto":{"cipher":"aes-128-ctr","cipherparams":{"iv":"ca987d7e87fe2593cca97f4d10b03254"},"ciphertext":"f5ecaed906ce6ede94dd4634c37e00a226b5416d9fe93ce50b06da10fe6f67f8","kdf":"scrypt","kdfparams":{"salt":"8347695fa1f3ec12cca485bb43332eed71ab2c624808ae73e6d8fdabc6fb4459","n":131072,"dklen":32,"p":1,"r":8},"mac":"75cae397f96217c330d802fe0cafba74a3ee7893269b61cfb70dda35c2e0c2fa"},"x-ethers":{"client":"ethers.js","gethFilename":"UTC--2020-03-30T03-10-07.0Z--5e99853e1e962cca2dc74ec91f1cbadaadc0c2c0","mnemonicCounter":"9bfb6045162dcac02f91a76f293e1d16","mnemonicCiphertext":"b40368231b707115458705ea929261b6","path":"m/44'/60'/0'/0/0","version":"0.1"}}`;

describe('Config unit tests', () => {
  describe('constructor()', () => {
    it('throws an error when initiating without required params', () => {
      expect(() => new Config({ providerUrls: null })).to.throw();
    });

    it('check all default values are set when empty config', async () => {
      const config = new Config({ providerUrls: [providerUrl] });
      await config.initialize();

      assert.isTrue(config.autostart);
      assert.isFalse(config.claiming);
      assert.equal(config.ms, 4000);
      assert.equal(config.scanSpread, 50);
      assert.isFalse(config.walletStoresAsPrivateKeys);
      expect(config.logger).to.exist; // tslint:disable-line no-unused-expression
      assert.isNull(config.wallet);
      assert.equal(config.economicStrategy.maxDeposit, Config.DEFAULT_ECONOMIC_STRATEGY.maxDeposit);
      assert.equal(config.economicStrategy.minBalance, Config.DEFAULT_ECONOMIC_STRATEGY.minBalance);
      assert.equal(
        config.economicStrategy.minProfitability,
        Config.DEFAULT_ECONOMIC_STRATEGY.minProfitability
      );
      assert.equal(
        config.economicStrategy.maxGasSubsidy,
        Config.DEFAULT_ECONOMIC_STRATEGY.maxGasSubsidy
      );
    });

    it('check all values are set when added to config object', async () => {
      const decimals = new BN('1000000000000000000');
      const economicStrategy = {
        maxDeposit: new BN(1).mul(decimals),
        minBalance: new BN(5).mul(decimals),
        minProfitability: new BN(0.01).mul(decimals),
        maxGasSubsidy: 200
      };

      const config = new Config({
        providerUrls: [providerUrl],
        autostart: false,
        claiming: true,
        economicStrategy,
        ms: 10000,
        scanSpread: 100,
        walletStoresAsPrivateKeys: true,
        logger: new DefaultLogger(),
        walletStores: [PRIVATE_KEY]
      });

      await config.initialize();

      assert.isFalse(config.autostart);
      assert.isTrue(config.claiming);
      assert.equal(config.ms, 10000);
      assert.equal(config.scanSpread, 100);
      assert.isTrue(config.walletStoresAsPrivateKeys);
      expect(config.logger).to.exist; // tslint:disable-line no-unused-expression
      assert.equal(config.wallet.getAccounts().length, 1);
      assert.equal(config.economicStrategy, economicStrategy);
    });

    it('wallet decrypted when using a keystore string', async () => {
      const config = new Config({
        providerUrls: [providerUrl],
        walletStores: [WALLET_KEYSTORE],
        password: WALLET_PASSWD
      });
      await config.initialize();

      assert.equal(config.wallet.getAccounts().length, 1);
    });

    it('wallet decrypted when using a keystore object', async () => {
      const config = new Config({
        providerUrls: [providerUrl],
        walletStores: [JSON.parse(WALLET_KEYSTORE)],
        password: WALLET_PASSWD
      });
      await config.initialize();

      assert.equal(config.wallet.getAccounts().length, 1);
    });

    it('throws an error when using a keystore without a password', async () => {
      const c = new Config({
        providerUrls: [providerUrl],
        walletStores: [WALLET_KEYSTORE],
        walletStoresAsPrivateKeys: false
      });
      expect(c.initialize()).to.eventually.throw();
    });
  });
});

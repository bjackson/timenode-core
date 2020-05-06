import loki from 'lokijs';
import { Config } from '../../src/index';
import { providerUrl } from './network';
import { DefaultLogger } from '../../src/Logger';

const PRIVATE_KEY = 'cf5583f962959b9454f03aa0fe050bde72b081194dbce49f20a5f2cc5f991c3d';

const mockConfig = async () => {
  // tslint:disable-next-line:no-hardcoded-credentials
  const password = 'password123';
  const wallet = [PRIVATE_KEY];
  const config = new Config({
    autostart: true,
    claiming: true,
    logger: new DefaultLogger(),
    ms: 4000,
    password,
    providerUrls: [providerUrl],
    scanSpread: 0,
    statsDb: new loki('stats.db'),
    walletStores: wallet,
    walletStoresAsPrivateKeys: true
  });

  await config.initialize();
  await config.statsDbLoaded;
  return config;
};

export { mockConfig, PRIVATE_KEY };

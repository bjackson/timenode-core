// tslint:disable-next-line:no-reference
/// <reference path="../global.d.ts" />
import { Util } from '@ethereum-alarm-clock/lib';
// import ethTx = require('ethereumjs-tx');
import { ethers, Wallet as EthWallet, utils as ethUtils } from 'ethers';
import { TransactionRequest } from 'ethers/providers/abstract-provider';
import { TransactionReceipt } from 'web3-core';

import { TxSendStatus } from '../Enum/TxSendStatus';
import { DefaultLogger, ILogger } from '../Logger';
import { Address } from '../Types';
import ITransactionOptions from '../Types/ITransactionOptions';
import { Operation } from '../Types/Operation';
import { AccountState, IAccountState, TransactionState } from './AccountState';
import { IWalletReceipt } from './IWalletReceipt';
import { ITransactionReceiptAwaiter, TransactionReceiptAwaiter } from './TransactionReceiptAwaiter';

export class Wallet {
  public nonce: number = 0;
  public accountState: IAccountState;

  private CONFIRMATION_BLOCKS = 6;
  private logger: ILogger;
  private accounts: EthWallet[] = [];
  private util: Util;
  private transactionAwaiter: ITransactionReceiptAwaiter;

  constructor(
    util: Util,
    accountState: IAccountState = new AccountState(),
    logger: ILogger = new DefaultLogger()
  ) {
    this.logger = logger;
    this.accountState = accountState;
    this.util = util;
    this.transactionAwaiter = new TransactionReceiptAwaiter(util);
  }

  get nextAccount(): EthWallet {
    return this.accounts[this.nonce % this.accounts.length];
  }

  public create(numAccounts: number) {
    for (let i = 0; i < numAccounts; i++) {
      const wallet = ethers.Wallet.createRandom();
      this.add(wallet);
    }
  }

  public add(wallet: EthWallet) {
    const address = wallet.address;

    if (!this.accounts.some((a) => a.address === address)) {
      this.accounts.push(wallet);
    }

    return wallet;
  }

  public async encrypt(password: string, opts: object) {
    // return this.accounts.map(wallet => wallet.toV3(password, opts));

    return Promise.all(this.accounts.map((wallet) => wallet.encrypt(password, opts)));
  }

  public loadPrivateKeys(privateKeys: string[]) {
    privateKeys.forEach((privateKey) => {
      const wallet = new EthWallet(privateKey);

      if (wallet) {
        this.add(wallet);
      } else {
        throw new Error("Couldn't load private key.");
      }
    });
  }

  public async decrypt(encryptedKeyStores: (string | object)[], password: string) {
    // Need to use for...of syntax here, as EthWallet.fromEncryptedJson is async.
    for (let keyStore of encryptedKeyStores) {
      keyStore = typeof keyStore === 'object' ? JSON.stringify(keyStore) : keyStore;
      const wallet = await EthWallet.fromEncryptedJson(keyStore, password);

      if (wallet) {
        this.add(wallet);
      } else {
        throw new Error("Couldn't decrypt key store. Wrong password?");
      }
    }
  }

  /**
   * sendFromNext will send a transaction from the account in this wallet that is next according to this.nonce
   * @param {TransactionParams} opts {to, value, gas, gasPrice, data}
   * @returns {Promise<IWalletReceipt>} A promise which will resolve to the transaction receipt
   */
  public sendFromNext(opts: any): Promise<IWalletReceipt> {
    const next = this.nonce++ % this.accounts.length;

    return this.sendFromIndex(next, opts);
  }

  public getNonce(account: string): Promise<number> {
    return this.util.getTransactionCount(account);
  }

  public isWalletAbleToSendTx(idx: number): boolean {
    if (this.accounts[idx] === undefined) {
      throw new Error('Index is outside range of addresses.');
    }

    const from: string = this.accounts[idx].address;

    return this.isAccountAbleToSendTx(from);
  }

  public isAccountAbleToSendTx(account: Address): boolean {
    return !this.accountState.hasPending(account);
  }

  public isWaitingForConfirmation(to: Address, operation: Operation): boolean {
    return this.accountState.isSent(to, operation);
  }

  public isNextAccountFree(): boolean {
    return this.isWalletAbleToSendTx(this.nonce % this.accounts.length);
  }

  public hasPendingTransaction(to: string, operation: Operation): boolean {
    return this.accountState.isPending(to, operation);
  }

  public async sendFromIndex(idx: number, opts: ITransactionOptions): Promise<IWalletReceipt> {
    if (this.accounts[idx] === undefined) {
      throw new Error('Index is outside range of addresses.');
    }

    const account = this.accounts[idx];
    const from: string = account.address;
    return this.sendFromAccount(from, opts);
  }

  public async sendFromAccount(from: Address, opts: ITransactionOptions): Promise<IWalletReceipt> {
    if (this.hasPendingTransaction(opts.to, opts.operation)) {
      return {
        from,
        status: TxSendStatus.PROGRESS
      };
    }

    const balance = await this.util.balanceOf(from);

    if (balance.eqn(0)) {
      this.logger.info(`${TxSendStatus.NOT_ENOUGH_FUNDS} ${from}`);
      return {
        from,
        status: TxSendStatus.NOT_ENOUGH_FUNDS
      };
    }

    const nonce = this.util.toHex(await this.getNonce(from));
    const v3Wallet = this.accounts.find((wallet: EthWallet) => {
      return wallet.address === from;
    });
    const signedTx = await this.signTransaction(v3Wallet, nonce, opts);

    if (!this.isAccountAbleToSendTx(from)) {
      return {
        from,
        status: TxSendStatus.BUSY
      };
    }

    let hash: string;
    let receipt: TransactionReceipt;

    try {
      this.accountState.set(from, opts.to, opts.operation, TransactionState.PENDING);

      this.logger.info(`Sending ${Operation[opts.operation]}`, opts.to);
      this.logger.debug(`Tx: ${JSON.stringify(signedTx)}`);

      const res = await this.sendRawTransaction(signedTx);
      hash = res.hash;

      if (res.error && !this.isEVMError(res.error)) {
        throw res.error;
      }

      receipt = await this.transactionAwaiter.waitForConfirmations(hash, 1);

      this.accountState.set(from, opts.to, opts.operation, TransactionState.SENT);

      this.logger.debug(`Receipt: ${JSON.stringify(receipt)}`);
    } catch (error) {
      this.accountState.set(from, opts.to, opts.operation, TransactionState.ERROR);
      this.logger.error(error, opts.to);
      return {
        from,
        status: TxSendStatus.UNKNOWN_ERROR
      };
    }

    try {
      this.logger.debug(`Awaiting for confirmation for tx ${hash} from ${from}`, opts.to);

      receipt = await this.transactionAwaiter.waitForConfirmations(hash, this.CONFIRMATION_BLOCKS);
      this.accountState.set(from, opts.to, opts.operation, TransactionState.CONFIRMED);

      this.logger.debug(`Transaction ${hash} from ${from} confirmed`, opts.to);
    } catch (error) {
      this.accountState.set(from, opts.to, opts.operation, TransactionState.ERROR);
      return {
        from,
        status: TxSendStatus.MINED_IN_UNCLE
      };
    }

    const status = this.isTransactionStatusSuccessful(receipt)
      ? TxSendStatus.OK
      : TxSendStatus.FAIL;

    return { receipt, from, status };
  }

  public getAccounts(): EthWallet[] {
    return this.accounts;
  }

  public getAddresses(): string[] {
    return this.accounts.map((account) => account.address);
  }

  public isKnownAddress(address: string): boolean {
    return this.getAddresses().some((addr) => addr === address);
  }

  public async sendRawTransaction(tx: string): Promise<{ hash: string; error?: Error }> {
    // const serialized = '0x'.concat(tx.serialize().toString('hex'));

    const sending = this.util.sendRawTransaction(tx);

    return new Promise<{ hash: string; error?: Error }>((resolve) =>
      sending
        .once('transactionHash', (receipt) => resolve({ hash: receipt }))
        // FIXME: Is this hash okay? Original is sha3-256.
        .on('error', (error) => resolve({ hash: ethUtils.id(tx), error }))
    );
  }

  private async signTransaction(
    from: EthWallet,
    nonce: number | string,
    opts: any
  ): Promise<string> {
    const transaction: TransactionRequest = {
      nonce,
      // from: from.address,
      to: opts.to,
      gasLimit: this.util.toHex(opts.gas),
      gasPrice: this.util.toHex(opts.gasPrice),
      value: this.util.toHex(opts.value),
      data: opts.data
    };

    const signedTransaction = from.sign(transaction);

    return signedTransaction;
  }

  private isTransactionStatusSuccessful(receipt: TransactionReceipt): boolean {
    if (receipt) {
      return [true, 1, '0x1', '0x01'].indexOf(receipt.status) !== -1;
    }

    return false;
  }

  private isEVMError(error: Error): boolean {
    return error && error.message.includes('reverted by the EVM');
  }
}

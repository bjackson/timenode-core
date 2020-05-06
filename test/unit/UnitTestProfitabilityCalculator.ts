import {
  GasPriceEstimation,
  Util,
  ITransactionRequest,
  GasPriceUtil
} from '@ethereum-alarm-clock/lib';
import BN from 'bn.js';
import * as TypeMoq from 'typemoq';

import { ProfitabilityCalculator } from '../../src/EconomicStrategy/ProfitabilityCalculator';
import { assert, expect } from 'chai';
// @ts-ignore
// import chaiBN from 'chai-bn';
// chai.use(chaiBN(BN));

// tslint:disable-next-line:no-big-function
describe('Profitability Calculator Tests', () => {
  const MWei = new BN(1000000);
  const GWei = MWei.muln(1000);
  const Szabo = GWei.muln(1000);
  const Finney = Szabo.muln(1000);

  const account = '0x123456';
  const defaultBounty = Finney.muln(20);
  const defaultGasPrice = GWei;
  const defaultPaymentModifier = new BN(10); //10%
  const defaultCallGas = new BN(21000);
  const CLAIMING_GAS_ESTIMATE = 100000;

  const util = new Util(null);

  const createTxRequest = (
    gasPrice = defaultGasPrice,
    bounty = defaultBounty,
    claimedBy = account,
    paymentModifier = defaultPaymentModifier,
    temporalUnit = 1,
    reservedWindowSize = new BN(3600),
    claimWindowEnd = new BN(123155)
  ) => {
    const txRequest = TypeMoq.Mock.ofType<ITransactionRequest>();
    txRequest.setup((tx) => tx.gasPrice).returns(() => gasPrice);
    txRequest.setup((tx) => tx.now()).returns(() => Promise.resolve(new BN(123123)));
    txRequest.setup((tx) => tx.reservedWindowEnd).returns(() => new BN(23423));
    txRequest.setup((tx) => tx.reservedWindowSize).returns(() => reservedWindowSize);
    txRequest.setup((tx) => tx.executionWindowEnd).returns(() => new BN(23423));
    txRequest.setup((tx) => tx.bounty).returns(() => bounty);
    txRequest.setup((tx) => tx.requiredDeposit).returns(() => MWei);
    txRequest.setup((tx) => tx.claimPaymentModifier()).returns(async () => paymentModifier);
    txRequest.setup((tx) => tx.claimedBy).returns(() => claimedBy);
    txRequest.setup((tx) => tx.address).returns(() => '0x987654321');
    txRequest.setup((tx) => tx.temporalUnit).returns(() => temporalUnit);
    txRequest.setup((tx) => tx.claimWindowEnd).returns(() => claimWindowEnd);
    txRequest.setup((tx) => tx.callGas).returns(() => defaultCallGas);
    txRequest.setup((tx) => tx.isClaimed).returns(() => true);

    return txRequest;
  };

  const createGasPriceUtil = (gasPrice = defaultGasPrice) => {
    const gasPriceUtil = TypeMoq.Mock.ofType<GasPriceUtil>();
    gasPriceUtil.setup((u) => u.networkGasPrice()).returns(() => Promise.resolve(gasPrice));
    gasPriceUtil.setup((u) => u.getGasPrice()).returns(() => Promise.resolve(gasPrice));
    gasPriceUtil
      .setup((u) => u.getAdvancedNetworkGasPrice())
      .returns(() =>
        Promise.resolve({
          safeLow: gasPrice,
          average: gasPrice,
          fast: gasPrice,
          fastest: gasPrice
        } as GasPriceEstimation)
      );

    return gasPriceUtil.object;
  };

  const calculateExpectedRewardWhenClaiming = (
    txRequest: ITransactionRequest,
    paymentModifier: BN | number,
    claimingGasCost: BN | number,
    executionSubsidy: BN | number
  ) =>
    txRequest.bounty
      .mul(new BN(paymentModifier))
      .divn(100)
      .sub(new BN(claimingGasCost))
      .sub(new BN(executionSubsidy));

  const calculateExpectedRewardWhenExecuting = (
    txRequest: ITransactionRequest,
    paymentModifier: BN | number,
    executionSubsidy: BN | number
  ) =>
    txRequest.bounty
      .mul(new BN(paymentModifier))
      .divn(100)
      .sub(new BN(executionSubsidy))
      .add(txRequest.isClaimed ? txRequest.requiredDeposit : new BN(0));

  const zeroProfitabilityExecutionGasPrice = (
    txRequest: ITransactionRequest,
    paymentModifier: BN | number,
    executionGasAmount: BN
  ) =>
    txRequest.bounty
      .mul(new BN(paymentModifier))
      .divn(100)
      .add(new BN(txRequest.isClaimed ? txRequest.requiredDeposit : 0))
      .div(executionGasAmount)
      .add(txRequest.gasPrice);

  describe('claiming profitability', () => {
    it('calculates profitability with default values', async () => {
      const strategy = new ProfitabilityCalculator(util, createGasPriceUtil());

      const paymentModifier = defaultPaymentModifier;
      const claimingGasCost = defaultGasPrice.muln(CLAIMING_GAS_ESTIMATE);
      const executionSubsidy = 0;

      const txRequest = createTxRequest().object;
      const expectedReward = calculateExpectedRewardWhenClaiming(
        txRequest,
        paymentModifier,
        claimingGasCost,
        executionSubsidy
      );

      const result = await strategy.claimingProfitability(txRequest, defaultGasPrice);

      assert.isTrue(expectedReward.eq(result));
      assert.isTrue(result.gtn(0));
    });

    it('calculates profitability with 0 minimum execution gas price', async () => {
      const strategy = new ProfitabilityCalculator(util, createGasPriceUtil());
      const paymentModifier = defaultPaymentModifier;
      const claimingGasCost = defaultGasPrice.muln(CLAIMING_GAS_ESTIMATE);

      const transactionExecutionGasPrice = new BN(0);
      const txRequest = createTxRequest(transactionExecutionGasPrice).object;

      const executionSubsidy = util.calculateGasAmount(txRequest).mul(defaultGasPrice); // this means that max gas Price is 2x
      const expectedReward = calculateExpectedRewardWhenClaiming(
        txRequest,
        paymentModifier,
        claimingGasCost,
        executionSubsidy
      );

      const result = await strategy.claimingProfitability(txRequest, defaultGasPrice);

      assert.isTrue(expectedReward.eq(result));
      assert.isTrue(result.gtn(0));
    });
  });

  describe('execution profitability', () => {
    it('calculates profitability with default values', async () => {
      const strategy = new ProfitabilityCalculator(util, createGasPriceUtil());

      const paymentModifier = defaultPaymentModifier;
      const executionSubsidy = 0;

      const txRequest = createTxRequest().object;
      const expectedReward = calculateExpectedRewardWhenExecuting(
        txRequest,
        paymentModifier,
        executionSubsidy
      );

      const result = await strategy.executionProfitability(txRequest, defaultGasPrice);

      assert.isTrue(expectedReward.eq(result));
      assert.isTrue(result.gtn(0));
    });

    it('returns 0 profitability when network gas price at zero profitability', async () => {
      const strategy = new ProfitabilityCalculator(util, createGasPriceUtil());
      const txRequest = createTxRequest().object;

      const paymentModifier = defaultPaymentModifier;
      const executionGasAmount = util.calculateGasAmount(txRequest);

      const maximumGasPrice = zeroProfitabilityExecutionGasPrice(
        txRequest,
        paymentModifier,
        executionGasAmount
      );
      const executionSubsidy = maximumGasPrice.sub(txRequest.gasPrice).mul(executionGasAmount);

      const expectedReward = calculateExpectedRewardWhenExecuting(
        txRequest,
        paymentModifier,
        executionSubsidy
      );

      const result = await strategy.executionProfitability(txRequest, maximumGasPrice);

      expect(expectedReward.toString()).to.eq(result.toString());
      assert.isTrue(expectedReward.eq(result));
      expect(result.toString()).to.eq('0');
    });

    it('returns negative profitability when network gas price above zero profitability', async () => {
      const strategy = new ProfitabilityCalculator(util, createGasPriceUtil());
      const txRequest = createTxRequest().object;

      const paymentModifier = defaultPaymentModifier;
      const executionGasAmount = util.calculateGasAmount(txRequest);

      const maximumGasPrice = zeroProfitabilityExecutionGasPrice(
        txRequest,
        paymentModifier,
        executionGasAmount
      );
      const negativeRewardGasPrice = maximumGasPrice.addn(1);

      const executionSubsidy = negativeRewardGasPrice
        .sub(txRequest.gasPrice)
        .mul(executionGasAmount);

      const expectedReward = calculateExpectedRewardWhenExecuting(
        txRequest,
        paymentModifier,
        executionSubsidy
      );

      const result = await strategy.executionProfitability(txRequest, negativeRewardGasPrice);

      assert.isTrue(expectedReward.eq(result));
      assert.isTrue(result.isNeg());
    });
  });
});

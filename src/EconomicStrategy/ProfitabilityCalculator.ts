import { ITransactionRequest, Util, GasPriceUtil } from '@ethereum-alarm-clock/lib';
import BN from 'bn.js';
import { ILogger, DefaultLogger } from '../Logger';

const CLAIMING_GAS_ESTIMATE = 100000; // Claiming gas is around 75k, we add a small surplus

export class ProfitabilityCalculator {
  private util: Util;
  private logger: ILogger;
  private gasPriceUtil: GasPriceUtil;

  constructor(util: Util, gasPriceUtil: GasPriceUtil, logger: ILogger = new DefaultLogger()) {
    this.util = util;
    this.gasPriceUtil = gasPriceUtil;
    this.logger = logger;
  }

  public async claimingProfitability(txRequest: ITransactionRequest, claimingGasPrice: BN) {
    const paymentModifier = await this.getPaymentModifier(txRequest);
    const claimingGasCost = claimingGasPrice.muln(CLAIMING_GAS_ESTIMATE);
    const { average } = await this.gasPriceUtil.getAdvancedNetworkGasPrice();
    const executionSubsidy = this.calculateExecutionSubsidy(txRequest, average);

    const reward = txRequest.bounty
      .mul(paymentModifier)
      .divn(100)
      .sub(claimingGasCost)
      .sub(executionSubsidy);

    this.logger.debug(
      `claimingProfitability: paymentModifier=${paymentModifier} targetGasPrice=${claimingGasPrice} bounty=${txRequest.bounty} reward=${reward}`,
      txRequest.address
    );

    return reward;
  }

  public async executionProfitability(txRequest: ITransactionRequest, executionGasPrice: BN) {
    const paymentModifier = await this.getPaymentModifier(txRequest);
    const executionSubsidy = this.calculateExecutionSubsidy(txRequest, executionGasPrice);
    const { requiredDeposit, bounty } = txRequest;

    const reward = bounty
      .mul(paymentModifier)
      .divn(100)
      .sub(executionSubsidy)
      .add(new BN(txRequest.isClaimed ? requiredDeposit : 0));

    this.logger.debug(
      `executionProfitability: executionSubsidy=${executionSubsidy} for executionGasPrice=${executionGasPrice} returns expectedReward=${reward}`,
      txRequest.address
    );

    return reward;
  }

  private calculateExecutionSubsidy(txRequest: ITransactionRequest, gasPrice: BN) {
    let executionSubsidy = new BN(0);

    if (txRequest.gasPrice < gasPrice) {
      const executionGasAmount = this.util.calculateGasAmount(txRequest);
      executionSubsidy = gasPrice.sub(txRequest.gasPrice).mul(executionGasAmount);
    }

    return executionSubsidy;
  }

  private async getPaymentModifier(txRequest: ITransactionRequest): Promise<BN> {
    return txRequest.claimPaymentModifier();
  }
}

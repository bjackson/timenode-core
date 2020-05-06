import BN from 'bn.js';
import { EthGasStationInfo } from '@ethereum-alarm-clock/lib';

export class NormalizedTimes {
  private gasStats: EthGasStationInfo;
  private temporalUnit: number;

  constructor(gasStats: EthGasStationInfo, temporalUnit: number) {
    this.gasStats = gasStats;
    this.temporalUnit = temporalUnit;
  }

  public pickGasPrice(timeLeft: BN): BN {
    if (timeLeft > this.safeLow) {
      return this.gasStats.safeLow;
    } else if (timeLeft > this.avg) {
      return this.gasStats.average;
    } else if (timeLeft > this.fast) {
      return this.gasStats.fast;
    } else if (timeLeft > this.fastest) {
      return this.gasStats.fastest;
    } else {
      return null;
    }
  }

  private get safeLow(): BN {
    return this.normalize(this.gasStats.safeLow);
  }

  private get avg(): BN {
    return this.normalize(this.gasStats.average);
  }

  private get fast(): BN {
    return this.normalize(this.gasStats.fast);
  }

  private get fastest(): BN {
    return this.normalize(this.gasStats.fastest);
  }

  private normalize(value: BN): BN {
    return this.isBlock ? this.normalizeToBlock(value) : this.normalizeToTimestamp(value);
  }

  private normalizeToBlock(value: BN): BN {
    return value.div(this.gasStats.blockTime);
  }

  private normalizeToTimestamp(value: BN): BN {
    return value.muln(10);
  }

  private get isBlock() {
    return this.temporalUnit === 1;
  }
}

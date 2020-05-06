import BN from 'bn.js';
import { Operation } from './Operation';

export default interface ITransactionOptions {
  to: string;
  value: BN;
  gas: BN;
  gasPrice: BN;
  data: string;
  operation: Operation;
}

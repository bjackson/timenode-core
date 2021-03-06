import TimeNode from '../TimeNode';
import { ReconnectMsg } from '../Enum';
import { EAC, Util } from '@ethereum-alarm-clock/lib';
import Web3 from 'web3';

declare const setTimeout: any;

export default class WsReconnect {
  private timeNode: TimeNode;
  private reconnectTries: number = 0;
  private reconnecting: boolean = false;
  private reconnected: boolean = false;

  constructor(timeNode: TimeNode) {
    this.timeNode = timeNode;
  }

  public setup(): void {
    const {
      logger,
      web3: { currentProvider }
    } = this.timeNode.config;

    // apparently provider has method .on even though types don't show it
    const p = currentProvider as any;

    p.on('error', (err: any) => {
      logger.debug(`[WS ERROR] ${err}`);

      setTimeout(async () => {
        const msg: ReconnectMsg = await this.handleWsDisconnect();
        logger.debug(`[WS RECONNECT] ${msg}`);
      }, this.reconnectTries * 1000);
    });

    p.on('end', (err: any) => {
      logger.debug(`[WS END] Type= ${err.type} Reason= ${err.reason}`);

      setTimeout(async () => {
        const msg = await this.handleWsDisconnect();
        logger.debug(`[WS RECONNECT] ${msg}`);
      }, this.reconnectTries * 1000);
    });
  }

  private async handleWsDisconnect(): Promise<ReconnectMsg> {
    if (this.reconnected) {
      return ReconnectMsg.ALREADY_RECONNECTED;
    }
    if (this.reconnectTries >= this.timeNode.config.maxRetries) {
      await this.timeNode.stopScanning();
      return ReconnectMsg.MAX_ATTEMPTS;
    }
    if (this.reconnecting) {
      return ReconnectMsg.RECONNECTING;
    }

    // Try to reconnect.
    this.reconnecting = true;
    const nextProviderUrl = await this.wsReconnect();
    if (nextProviderUrl) {
      this.timeNode.config.activeProviderUrl = nextProviderUrl;
      await this.timeNode.startScanning();
      this.reconnectTries = 0;
      this.setup();
      this.reconnected = true;
      this.reconnecting = false;
      setTimeout(() => {
        this.reconnected = false;
      }, 10000);
      return ReconnectMsg.RECONNECTED;
    }

    this.reconnecting = false;
    this.reconnectTries++;
    setTimeout(() => {
      this.handleWsDisconnect();
    }, this.reconnectTries * 1000);

    return ReconnectMsg.FAIL;
  }

  private async wsReconnect(): Promise<string | null> {
    const {
      config: { logger, providerUrls }
    } = this.timeNode;
    logger.debug('Attempting WS Reconnect.');
    try {
      const providerUrl = providerUrls[this.reconnectTries % providerUrls.length];
      this.timeNode.config.web3.setProvider(new Web3.providers.WebsocketProvider(providerUrl));
      this.timeNode.config.eac = new EAC(this.timeNode.config.web3);
      if (await Util.isWatchingEnabled(this.timeNode.config.web3)) {
        return providerUrl;
      } else {
        throw new Error('Invalid providerUrl! eth_getFilterLogs not enabled.');
      }
    } catch (err) {
      logger.error(err.message);
      logger.info(`Reconnect tries: ${this.reconnectTries}`);
      return null;
    }
  }
}

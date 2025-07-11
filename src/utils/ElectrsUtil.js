import config from "../conf/config.js";
import axios from "axios";

const electrsHost = config.electrsHost || config.alkanesUtxoUrl;

export default class ElectrsUtil {
  static async getMempoolTxids() {
    const url = `${electrsHost}/txids`;
    const resp = await axios.get(url, {
      timeout: 10000,
    });
    return resp.data;
  }
  static async getTx(txid) {
    const url = `${electrsHost}/tx/${txid}`;
    const resp = await axios.get(url, {
      timeout: 10000,
    });
    return resp.data;
  }

  static async getUtxos(address) {
    const url = `${electrsHost}/address/${address}/utxo`;
    const resp = await axios.get(url, {
      timeout: 10000,
    });

    resp.data.forEach((u) => (u.address = address));
    return resp.data;
  }

  static async postTx(txHex) {
    const url = `${electrsHost}/tx`;
    try {
      const resp = await axios.post(url, txHex, {
        timeout: 10000,
      });
      return resp.data;
    } catch (error) {
      throw new Error(
        `${
          (error && error.response && error.response.data) ||
          "transction post failed"
        }`
      );
    }
  }

  /**
   * 广度优先遍历未确认交易的所有祖先，并以outpoint为索引返回
   * @param {*} txid
   * @returns
   */
  static async getAllUnConfirmeAncestor(txid) {
    let queue = [];
    queue.push(txid);
    const outpoint2Tx = new Map();
    while (queue.length > 0) {
      const temp = queue.slice(0, Math.min(queue.length, 10));
      const txJsonList = await Promise(
        temp.map(async (txid) => await getTx(txid))
      );
      txJsonList.forEach((t) => {
        t.vout.forEach((v, i) => {
          outpoint2Tx.set(t.txid + ":" + i, t);
        });
      });
      txJsonList
        .filter((t) => !t.status.confirmed)
        .forEach((i) => {
          i.vin.forEach((v) => {
            queue.push(v.txid);
          });
        });
    }
    return outpoint2Tx;
  }

  static async getTxStatus(txid) {
    const url = `${electrsHost}/tx/${txid}/status`;
    const resp = await axios.get(url, {
      timeout: 10000,
    });
    return resp.data;
  }

  static async getTxOutspend(txid, vout) {
    const url = `${electrsHost}/tx/${txid}/outspend/${vout}`;
    const resp = await axios.get(url, {
      timeout: 10000,
    });
    return resp.data;
  }
}

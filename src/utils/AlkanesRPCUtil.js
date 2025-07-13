import { AlkanesRpc } from "alkanes/lib/rpc.js";
import config from "../conf/config.js";
import * as util from "util";

const alkanesRpc = new AlkanesRpc({
  baseUrl: config.alkanesUrl,
});

export default class AlkanesRPCUtil {
  static async trace(txid, vout) {
    return await alkanesRpc.trace({ txid, vout });
  }

  static async protorunesbyoutpoint(txid,vout){
      return await alkanesRpc.protorunesbyoutpoint({txid,vout,protocolTag:BigInt(1)});
    }

  static async protorunesbyaddress(address){
    return await alkanesRpc.protorunesbyaddress({address,protocolTag:BigInt(1)});
  }

  static async simulate(alkanesId, params) {
    let tmp = alkanesId.split(":");
    let inputs = params.map((p) => BigInt(p));
    const simulation = await alkanesRpc.simulate({
      alkanes: [],
      transaction: "",
      height: 1000000n,
      block: "",
      txindex: 0,
      target: {
        block: BigInt(tmp[0]),
        tx: BigInt(tmp[1]),
      },
      inputs,
      pointer: 0,
      refundPointer: 0,
      vout: 0,
    });
    if (simulation.execution.error) {
      throw new Error(simulation.execution.error);
    }
    return simulation.execution.data;
  }

  static async queryString(alkanesId, params) {
    let data = await this.simulate(alkanesId, params);
    data = Buffer.from(data.slice(2, data.length), "hex");
    return Buffer.from(data).toString();
  }

  static async queryObject(alkanesId, params) {
    return JSON.parse(await this.queryString(alkanesId, params));
  }

  static async queryVec8() {
    let data = await this.simulate(alkanesId, params);
    data = Buffer.from(data.slice(2, data.length), "hex");
    return data;
  }

  static async queryU128(alkanesId, params) {
    let data = await this.simulate(alkanesId, params);
    data = Buffer.from(data.slice(2, data.length), "hex");
    const t = data.readBigUInt64LE(0) | (data.readBigUInt64LE(8) << 64n);
    return t;
  }
}

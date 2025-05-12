import AddressUtil from '../lib/AddressUtil.js';
import LaunchWhitelist from '../models/LaunchWhitelist.js';


export default class LaunchWhitelistMapper {
    
    static async hasStageWhitelist(launchId, stage) {
        const whitelist = await LaunchWhitelist.findOne({
            where: {launchId, stage}
        });
        return whitelist !== null;
    }

    static async findAddressStageWhitelist(launchId, stage, address) {
        const whitelist = await LaunchWhitelist.findOne({
            where: {
                launchId,
                stage,
                address: AddressUtil.toPublicKey(address).toString('hex')
            },
            raw: true
        });
        return whitelist;
    }
    
}



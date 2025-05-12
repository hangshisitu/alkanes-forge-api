import AlkanesService from "../service/AlkanesService.js";
import {Constants} from "../conf/constants.js";
import NftCollectionService from "../service/NftCollectionService.js";

async function detail(ctx) {
    const {id} = ctx.request.body;
    const collection = await NftCollectionService.findById(id);
    if (!collection) {
        throw new Error('Not found the collection.')
    }
    return {
        id: collection.id,
        name: collection.name,
        symbol: collection.symbol,
        logo: collection.image,
        cover: collection.launchImage,
        banner: collection.launchBanner,
        stages: collection.launchStages,
        identifier: collection.identifier,
        minted: collection.minted,
        totalSupply: collection.totalSupply,
        description: collection.description,
        twitter: collection.twitter,
        discord: collection.discord,
        website: collection.website,
        telegram: collection.telegram
    };
}

async function createOrder(ctx) {
    const {fundAddress, fundPublicKey, toAddress, id, mints, postage, feerate} = ctx.request.body;
    return await AlkanesService.transferMintFee(fundAddress, fundPublicKey, toAddress, id, mints, postage, feerate)
}

async function startOrder(ctx) {
    const {fundAddress, toAddress, id, mints, postage, feerate, psbt} = ctx.request.body;
    return await AlkanesService.startMint(fundAddress, toAddress, id, mints, postage, feerate, psbt)
}

export default [
    {
        path: Constants.API.LAUNCH.DETAIL,
        method: 'post',
        handler: detail
    },
    {
        path: Constants.API.LAUNCH.CREATE_ORDER,
        method: 'post',
        handler: createOrder
    },
    {
        path: Constants.API.LAUNCH.START_ORDER,
        method: 'post',
        handler: startOrder
    },
]
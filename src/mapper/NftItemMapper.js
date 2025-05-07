import NftItem from "../models/NftItem.js";

export default class NftItemMapper {

    static async getAddressCollectionItems(address, collectionId) {
        return await NftItem.findAll({
            where: {
                holder: address,
                collectionId
            },
            raw: true,
        });
    }

    static async getCollectionItems(collectionId) {
        return await NftItem.findAll({
            where: {
                collectionId
            },
            raw: true,
        });
    }
}

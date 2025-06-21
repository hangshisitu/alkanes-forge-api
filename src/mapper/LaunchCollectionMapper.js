import LaunchCollection from '../models/LaunchCollection.js';

export default class LaunchCollectionMapper {
    
    static async findById(id) {
        return LaunchCollection.findByPk(id, {
            raw: true
        });
    }

    static async findByCollectionId(collectionId) {
        return LaunchCollection.findOne({ where: { collectionId } });
    }

    static async bulkUpdateCollectionsMinted(infos, options = {transaction: null}) {
        // 需要根据collectionId来更新minted和updateHeight
        for (const info of infos) {
            await LaunchCollection.update(
                {
                    minted: info.minted,
                    updateHeight: info.updateHeight
                },
                { where: { collectionId: info.collectionId }, transaction: options.transaction }
            );
        }
    }

    static async updateById(id, data) {
        return LaunchCollection.update(data, {
            where: { id },
            returning: true
        });
    }


}

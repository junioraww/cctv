import { Sequelize, DataTypes, Model } from '@sequelize/core'

export default class GroupUser extends Model {
	static init(sequelize) {
		return super.init({
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        role: { type: DataTypes.INTEGER, defaultValue: 0 },
        name: { type: DataTypes.STRING, allowNull: false },
        avatar: { type: DataTypes.STRING, allowNull: true },
        expiresAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
		}, {
			  sequelize,
			  modelName: 'GroupUser',
			  timestamps: false
		})
	}
    
    static associate(models) {
        //GroupUser.hasOne(models.Invite, { foreignKey: 'usedById' })
	  }
}

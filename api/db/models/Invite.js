import { DataTypes, Model } from '@sequelize/core'

export default class Invite extends Model {
	static init(sequelize) {
		return super.init({
			id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
			nonce: { type: DataTypes.STRING, allowNull: false, unique: true },
			used: { type: DataTypes.BOOLEAN, defaultValue: false },
			isTemporary: { type: DataTypes.BOOLEAN, defaultValue: false },
			durationMinutes: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
			expiresAt: { type: DataTypes.INTEGER, allowNull: false },
		}, {
			sequelize,
			modelName: 'Invite',
			timestamps: false
		})
	}
	
	static associate(models) {
		Invite.belongsTo(models.User, { foreignKey: 'creatorId', as: 'creator' })
		Invite.belongsTo(models.User, { foreignKey: 'usedById', as: 'usedBy' })
		Invite.belongsTo(models.Group, { foreignKey: 'groupId', as: 'group' })
	}
}

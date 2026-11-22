import { DataTypes, Model } from '@sequelize/core'

export default class Group extends Model {
	static init(sequelize) {
		return super.init({
			id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
            name: { type: DataTypes.STRING, allowNull: true },
		}, {
			sequelize,
			modelName: 'Group',
			timestamps: false
		})
	}
	
	static associate(models) {
		Group.belongsToMany(models.User, { through: models.GroupUser, as: 'users', foreignKey: 'groupId', otherKey: 'userId' })
        Group.hasMany(models.Camera, { foreignKey: 'groupId', as: 'cameras' })
        Group.hasMany(models.Invite, { foreignKey: 'groupId', as: 'invites' })
	}
}

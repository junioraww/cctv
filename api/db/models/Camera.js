import { DataTypes, Model } from '@sequelize/core'

export default class Camera extends Model {
	static init(sequelize) {
		return super.init({
			id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
			media: { type: DataTypes.STRING, defaultValue: '[]', allowNull: false },
      config: { type: DataTypes.STRING, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      alwaysReady: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
		}, {
			sequelize,
			modelName: 'Camera',
			timestamps: false
		})
	}
	
	static associate(models) {
		Camera.belongsTo(models.Group, { foreignKey: 'groupId' })
	}
}

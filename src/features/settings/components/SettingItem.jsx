import { settingTypes } from './settingTypes'

export const SettingItem = ({ itemData }) => {
	const typeData = settingTypes[itemData.type]

	return (
		typeData ? <typeData.component itemData={itemData}></typeData.component> : <></>
	)
}

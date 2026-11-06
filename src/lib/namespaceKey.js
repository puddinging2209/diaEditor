import { appInfo } from '../data/appInfo'

export const getNameSpaceKey = (name) => {
	return [appInfo.author, appInfo.id, name].join('.')
}

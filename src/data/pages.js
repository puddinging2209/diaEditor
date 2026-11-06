import { HiCog6Tooth, HiHome, HiOutlineCog6Tooth, HiOutlineHome } from 'react-icons/hi2'
import { MainPage } from '../features/main/MainPage'
import { SettingsPage } from '../features/settings/SettingsPage'

export const pages = {
	main: {
		id: 'main',
		name: 'メイン',
		icon: HiOutlineHome,
		iconSelected: HiHome,
		component: MainPage,
	},
	settings: {
		id: 'settings',
		name: '設定',
		icon: HiOutlineCog6Tooth,
		iconSelected: HiCog6Tooth,
		component: SettingsPage,
	},
}

export const sidebarTop = [
	pages.main,
	pages.main,
	pages.main
]

export const sidebarBottom = [
	pages.settings
]

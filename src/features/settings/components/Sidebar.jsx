import { VStack } from '@chakra-ui/react'
import { settingPages } from '../../../data/settings'
import { SidebarItem } from './SidebarItem'

export const Sidebar = () => {
	return (
		<VStack gap={2} paddingInline={4}>
			{
				settingPages
					.filter(e => !e.hidden)
					.map((e, i) => <SidebarItem itemData={e} key={i}></SidebarItem>)
			}
		</VStack>
	)
}

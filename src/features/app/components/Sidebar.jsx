import { Flex, VStack } from '@chakra-ui/react'
import { sidebarBottom, sidebarTop } from '../../../data/pages'
import { SidebarItem } from './SidebarItem'

export const Sidebar = () => {
	return (
		<Flex
			direction='column'
			justifyContent='space-between'
			alignContent='center'
			width='full'
			height='full'
			paddingInline='0.375rem'
		>
			<VStack gap={0}>
				{
					sidebarTop.map((e, i) => <SidebarItem itemData={e} key={i}></SidebarItem>)
				}
			</VStack>
			<VStack gap={0}>
				{
					sidebarBottom.map((e, i) => <SidebarItem itemData={e} key={i}></SidebarItem>)
				}
			</VStack>
		</Flex>
	)
}

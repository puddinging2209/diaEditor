import { Button, HStack, Text } from '@chakra-ui/react'
import { useAtom } from 'jotai'
import { pageIdAtom } from '../states/page'

export const SidebarItem = ({ itemData }) => {
	const [pageId, setPageId] = useAtom(pageIdAtom)
	const isSelected = (pageId === itemData.id)
	const IconElement = isSelected ? itemData.iconSelected : itemData.icon

	return (
		<Button
			variant={isSelected ? 'subtle' : 'ghost'}
			color={isSelected ? null : { base: 'fg.muted', _hover: 'fg' }}
			width='full'
			height='3rem'
			onClick={() => setPageId(itemData.id)}
		>
			<HStack
				width='full'
				alignItems='center'
				overflowX='hidden'
				gap={4}
			>
				<IconElement size='24px' style={{ width: '24px', height: '24px' }}></IconElement>
				<Text fontSize='lg' fontWeight='normal'>{itemData.name}</Text>
			</HStack>
		</Button>
	)
}

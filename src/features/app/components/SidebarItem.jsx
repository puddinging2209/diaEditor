import { Tooltip } from '@/components/ui/tooltip'
import { Center, HStack, IconButton, Text } from '@chakra-ui/react'
import { useAtom, useAtomValue } from 'jotai'
import { pageIdAtom } from '../states/page'
import { isSidebarOpenAtom } from '../states/sidebar'

export const SidebarItem = ({ itemData }) => {
	const isSidebarOpen = useAtomValue(isSidebarOpenAtom)
	const [pageId, setPageId] = useAtom(pageIdAtom)
	const isSelected = (pageId === itemData.id)
	const IconElement = isSelected ? itemData.iconSelected : itemData.icon

	return (
		<Center width='full' height='3rem'>
			<Tooltip
				content={itemData.name}
				positioning={{ placement: "right" }}
				showArrow
				disabled={isSidebarOpen}
				openDelay={0}
				closeDelay={0}
			>
				<IconButton
					padding={0}
					border={0}
					variant='subtle'
					background={isSelected ? 'bg.emphasized' : null}
					color={isSelected ? null : { base: 'fg.muted', _hover: 'fg' }}
					size='sm'
					width='full'
					onClick={() => setPageId(itemData.id)}
				>
					<HStack
						width='full'
						alignItems='center'
						padding='0.375rem'
						overflowX='hidden'
						gap={4}
					>
						<IconElement size='24px' style={{ width: '24px', height: '24px' }}></IconElement>
						<Text fontSize='lg' fontWeight='normal'>{isSidebarOpen ? itemData.name : (<></>)}</Text>
					</HStack>
				</IconButton>
			</Tooltip>
		</Center>
	)
}

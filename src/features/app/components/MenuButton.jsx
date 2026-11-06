import { Center, IconButton } from '@chakra-ui/react'
import { useSetAtom } from 'jotai'
import { HiBars3 } from 'react-icons/hi2'
import { isSidebarOpenAtom } from '../states/sidebar'

export const MenuButton = () => {
	const setIsSidebarOpen = useSetAtom(isSidebarOpenAtom)

	return (
		<Center width='3rem' height='3rem'>
			<IconButton
				variant='subtle'
				size='sm'
				onClick={() => setIsSidebarOpen(prev => !prev)}
			>
				<HiBars3 size='24px' style={{ width: '24px', height: '24px' }}></HiBars3>
			</IconButton>
		</Center>
	)
}

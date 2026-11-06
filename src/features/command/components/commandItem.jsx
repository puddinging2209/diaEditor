import { Button, Center, HStack, Kbd, SimpleGrid, Text, VStack } from '@chakra-ui/react'
import { useAtomValue } from 'jotai'
import { useRef } from 'react'
import { settingAtom } from '../../../state/settingAtom'

export const CommandItem = ({ itemData, selected, run }) => {
	const buttonRef = useRef(null)
	if (selected) {
		buttonRef.current?.scrollIntoView?.({ block: 'nearest' })
	}
	const keyAtom = settingAtom(`command_platte.shortcuts.${itemData.id}`)
	const key = useAtomValue(keyAtom)

	return (
		<Button
			ref={buttonRef}
			onClick={run}
			variant='ghost'
			background={selected ? 'bg.emphasized' : { _hover: "bg.emphasized" }}
			transition='background 0s'
			size='lg'
			width='full'
			textAlign='left'
			lineHeight='shorter'
			padding={0}
		>
			<SimpleGrid
				width='full'
				templateColumns='max-content 1fr max-content'
				alignItems='center'
				padding={2}
				gap={2}
			>
				<Center width={6} height='full'>
					{itemData.icon ? <itemData.icon style={{ width: '24px', height: '24px' }} /> : <></>}
				</Center>

				<VStack alignItems='flex-start' gap={0}>
					<Text fontSize='sm'>{itemData.name}{itemData.type === 'complement' ? '...' : ''}</Text>
					<Text color='fg.muted' fontSize='xs'>{itemData.id}</Text>
				</VStack>

				<HStack>
					{
						key?.map?.(k => (
							<Kbd key={k} size='sm'>{k}</Kbd>
						))
					}
				</HStack>
			</SimpleGrid>
		</Button>
	)
}

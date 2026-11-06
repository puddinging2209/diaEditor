import { SimpleGrid, SwitchControl, SwitchHiddenInput, SwitchLabel, SwitchRoot, Text, VStack } from '@chakra-ui/react'
import { useAtom } from 'jotai'
import { settingAtom } from '../../../../state/settingAtom'

export const Checkbox = ({ itemData }) => {
	const itemAtom = settingAtom(itemData.id)
	const [value, setValue] = useAtom(itemAtom)

	return (
		<SimpleGrid
			width='full'
			minHeight='3rem'
			templateColumns='1fr max-content'
			alignItems='center'
			gap={4}
		>
			<VStack alignItems='flex-start' gap={0.5}>
				<Text>{itemData.name}</Text>
				<Text color='fg.muted' fontSize='sm'>{itemData.description}</Text>
			</VStack>

			<SwitchRoot checked={value} onCheckedChange={e => setValue(e.checked)}>
				<SwitchHiddenInput></SwitchHiddenInput>
				<SwitchControl></SwitchControl>
				<SwitchLabel></SwitchLabel>
			</SwitchRoot>
		</SimpleGrid>
	)
}

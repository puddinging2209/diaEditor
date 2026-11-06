import { NumberInputControl, NumberInputInput, NumberInputRoot, SimpleGrid, Text, VStack } from '@chakra-ui/react'
import { useAtom } from 'jotai'
import { settingAtom } from '../../../../state/settingAtom'

export const NumberInput = ({ itemData }) => {
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

			<NumberInputRoot
				width='12rem'
				min={itemData.min}
				max={itemData.max}
				step={itemData.step}
				value={value}
				onValueChange={e => setValue(Number(e.value))}
			>
				<NumberInputControl />
				<NumberInputInput />
			</NumberInputRoot>
		</SimpleGrid>
	)
}

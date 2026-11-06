import { createListCollection, Portal, SelectContent, SelectControl, SelectHiddenSelect, SelectIndicator, SelectIndicatorGroup, SelectItem, SelectItemIndicator, SelectPositioner, SelectRoot, SelectTrigger, SelectValueText, SimpleGrid, Text, VStack } from '@chakra-ui/react'
import { useAtom } from 'jotai'
import { settingAtom } from '../../../../state/settingAtom'

export const Select = ({ itemData }) => {
	const itemAtom = settingAtom(itemData.id)
	const [value, setValue] = useAtom(itemAtom)
	const options = createListCollection({
		items: Object.entries(itemData.options).map(([k, v]) => {
			return {
				label: v,
				value: k
			}
		})
	})

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

			<SelectRoot
				width='12rem'
				collection={options}
				value={[value]}
				onValueChange={e => setValue(e.value[0])}
			>
				<SelectHiddenSelect />
				<SelectControl>
					<SelectTrigger>
						<SelectValueText placeholder="選択" />
					</SelectTrigger>
					<SelectIndicatorGroup>
						<SelectIndicator />
					</SelectIndicatorGroup>
				</SelectControl>
				<Portal>
					<SelectPositioner>
						<SelectContent>
							{options.items.map((option) => (
								<SelectItem item={option} key={option.value}>
									{option.label}
									<SelectItemIndicator />
								</SelectItem>
							))}
						</SelectContent>
					</SelectPositioner>
				</Portal>
			</SelectRoot>
		</SimpleGrid>
	)
}

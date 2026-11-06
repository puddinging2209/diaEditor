import { ColorPickerArea, ColorPickerChannelSlider, ColorPickerContent, ColorPickerControl, ColorPickerEyeDropper, ColorPickerHiddenInput, ColorPickerInput, ColorPickerPositioner, ColorPickerRoot, ColorPickerTrigger, HStack, parseColor, Portal, SimpleGrid, Text, VStack } from '@chakra-ui/react'
import { useAtom } from 'jotai'
import { settingAtom } from '../../../../state/settingAtom'

export const Color = ({ itemData }) => {
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

			<ColorPickerRoot
				width='12rem'
				value={parseColor(value ?? '#ffffff')}
				onValueChange={e => setValue(e.value.toString('hex'))}
			>
				<ColorPickerHiddenInput />
				<ColorPickerControl>
					<ColorPickerInput />
					<ColorPickerTrigger />
				</ColorPickerControl>
				<Portal>
					<ColorPickerPositioner>
						<ColorPickerContent>
							<ColorPickerArea />
							<HStack>
								<ColorPickerEyeDropper size="xs" variant="outline" />
								<ColorPickerChannelSlider channel='hue' />
							</HStack>
						</ColorPickerContent>
					</ColorPickerPositioner>
				</Portal>
			</ColorPickerRoot>
		</SimpleGrid>
	)
}
